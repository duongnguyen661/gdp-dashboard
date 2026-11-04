// Nhân vật (khách, nhân viên, chủ quán, người đi đường), chó, xe, xe đẩy bán hàng rong, món ăn
import * as THREE from 'three';
import { groundY } from './world.js';
import { textSprite, setSpriteText, scaleByDistance } from './ui3d.js';

const matCache = new Map();
const mat = (hex, o = {}) => {
  const k = hex + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8, ...o }));
  return matCache.get(k);
};
const G = {
  torso: new THREE.BoxGeometry(0.42, 0.6, 0.26),
  head: new THREE.SphereGeometry(0.14, 12, 10),
  hair: new THREE.SphereGeometry(0.152, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
  thigh: new THREE.BoxGeometry(0.16, 0.38, 0.17),
  shin: new THREE.BoxGeometry(0.14, 0.37, 0.15),
  uarm: new THREE.BoxGeometry(0.1, 0.28, 0.1),
  farm: new THREE.BoxGeometry(0.09, 0.27, 0.09),
  blob: new THREE.PlaneGeometry(0.9, 0.9),
};
const SKIN = [0xf1c9a5, 0xe0ac82, 0xc68863, 0xa8714f];
const HAIR = [0x111111, 0x2a1a10, 0x3b2a1c, 0x5a4632, 0x777777];
const SHIRT = [0xd64545, 0x3f7fd6, 0x3fae6a, 0xe0a63a, 0x8a5bc7, 0xe07fa0, 0x4fb8c4, 0xf2f2f2, 0x444b5a, 0xc9742b];
const PANTS = [0x2a3042, 0x3a3a3a, 0x4a5a78, 0x5a4636];

export const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

const blobMat = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
})();

export class Person {
  constructor({ id = '', name = '', look = null, role = 'npc', shirt = null, tag = true, scale = 1 } = {}) {
    this.id = id; this.role = role; this.name = name;
    const h = hash(id || name || Math.random());
    const sk = SKIN[h % 4], hr = HAIR[(h >>> 3) % 5], sh = shirt ?? SHIRT[(h >>> 5) % SHIRT.length], pn = PANTS[(h >>> 9) % 4];
    this.group = new THREE.Group();
    this.group.scale.setScalar(scale * (0.94 + ((h >>> 11) % 12) / 100));
    this.body = new THREE.Group(); this.group.add(this.body);
    const torso = new THREE.Mesh(G.torso, mat(sh)); torso.position.y = 1.05; this.body.add(torso);
    const head = new THREE.Mesh(G.head, mat(sk)); head.position.y = 1.55; this.body.add(head);
    const hair = new THREE.Mesh(G.hair, mat(hr)); hair.position.y = 1.56; hair.rotation.x = -0.15; this.body.add(hair);
    const limb = (geoU, geoL, pivotY, x, lenU, mU, mL) => {
      const top = new THREE.Group(); top.position.set(x, pivotY, 0); this.body.add(top);
      const u = new THREE.Mesh(geoU, mU); u.position.y = -lenU / 2; top.add(u);
      const knee = new THREE.Group(); knee.position.y = -lenU; top.add(knee);
      const l = new THREE.Mesh(geoL, mL); l.position.y = -(geoL.parameters.height) / 2; knee.add(l);
      return { top, knee };
    };
    this.legL = limb(G.thigh, G.shin, 0.75, -0.11, 0.38, mat(pn), mat(pn));
    this.legR = limb(G.thigh, G.shin, 0.75, 0.11, 0.38, mat(pn), mat(pn));
    this.armL = limb(G.uarm, G.farm, 1.32, -0.27, 0.28, mat(sh), mat(sk));
    this.armR = limb(G.uarm, G.farm, 1.32, 0.27, 0.28, mat(sh), mat(sk));
    this.hand = new THREE.Group(); this.hand.position.y = -0.27; this.armR.knee.add(this.hand);
    const shadow = new THREE.Mesh(G.blob, blobMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; this.group.add(shadow);
    this.extras = {};
    if (tag && name) {
      this.tag = textSprite(name, { size: 30, worldH: 0.34, maxW: 360, pad: 10, radius: 12, bg: role === 'staff' || role === 'owner' ? 'rgba(179,38,30,0.85)' : 'rgba(10,10,20,0.7)' });
      this.tag.position.y = 2.05; this.group.add(this.tag);
    }
    this.state = 'stand'; this.path = []; this.speed = 1.35; this.phase = Math.random() * 6;
    this.onArrive = null; this.seat = null; this.t = Math.random() * 10;
    this.drinkT = 3 + Math.random() * 8; this.drinkAnim = 0; this.callAnim = 0; this.carry = null;
    this.bubble = null; this.bubbleT = 0; this.heading = 0; this.sitBlend = 0;
  }
  get pos() { return this.group.position; }
  placeAt(x, z) { this.group.position.set(x, groundY(x, z), z); }
  setName(t, extra) { if (this.tag) setSpriteText(this.tag, t, extra); }

  walkTo(points, cb) {
    this.path = points.map((p) => ({ x: p.x, z: p.z }));
    this.onArrive = cb || null; this.state = 'walk'; this.sitBlend = 0;
  }
  sitAt(seat) {
    this.state = 'sit'; this.seat = seat; this.path = [];
    this.group.position.set(seat.x, seat.y, seat.z); this.group.rotation.y = seat.faceY;
  }
  stand() { this.state = 'stand'; this.seat = null; }
  call() { this.callAnim = 1.4; }
  holdItem(mesh) { this.clearHold(); if (mesh) { this.hand.add(mesh); this.carry = mesh; } }
  clearHold() { if (this.carry) { this.hand.remove(this.carry); this.carry = null; } }

  say(text, ms = 3800, kind = 'guest') {
    if (this.bubble) { this.group.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble.material.dispose(); }
    const colors = { guest: ['#fff', 'rgba(30,30,40,0.88)'], staff: ['#fff', 'rgba(179,38,30,0.92)'], owner: ['#2a1a00', 'rgba(255,200,60,0.96)'], npc: ['#fff', 'rgba(40,80,60,0.9)'], dog: ['#2a1a00', 'rgba(255,255,255,0.92)'] };
    const [fg, bg] = colors[kind] || colors.guest;
    this.bubble = textSprite(text, { size: 36, worldH: 0.5, maxW: 460, pad: 14, fg, bg, radius: 20, border: 'rgba(255,255,255,0.5)' });
    this.bubble.position.y = this.tag ? 2.55 : 2.2; this.bubble.renderOrder = 5;
    this.group.add(this.bubble); this.bubbleT = ms / 1000;
  }

  update(dt, camera) {
    this.t += dt;
    const g = this.group;
    if (this.state === 'walk') {
      const p = this.path[0];
      if (!p) { this.state = 'stand'; const cb = this.onArrive; this.onArrive = null; cb?.(); }
      else {
        const dx = p.x - g.position.x, dz = p.z - g.position.z, d = Math.hypot(dx, dz);
        const step = this.speed * dt;
        if (d <= step) { g.position.x = p.x; g.position.z = p.z; this.path.shift(); }
        else { g.position.x += (dx / d) * step; g.position.z += (dz / d) * step; this.heading = Math.atan2(dx, dz); }
        g.position.y = groundY(g.position.x, g.position.z);
        let dr = this.heading - g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); g.rotation.y += dr * Math.min(1, dt * 10);
        this.phase += dt * this.speed * 4.2;
      }
    }
    // tư thế
    const walking = this.state === 'walk', sitting = this.state === 'sit';
    const sw = walking ? Math.sin(this.phase) : 0;
    const target = sitting ? 1 : 0;
    this.sitBlend += (target - this.sitBlend) * Math.min(1, dt * 9);
    const sb = this.sitBlend;
    this.body.position.y = -0.27 * sb + (walking ? Math.abs(Math.cos(this.phase)) * 0.03 : Math.sin(this.t * 1.7) * 0.004);
    for (const [leg, sgn] of [[this.legL, 1], [this.legR, -1]]) {
      leg.top.rotation.x = sw * 0.7 * sgn * (1 - sb) - (Math.PI / 2) * sb;
      leg.knee.rotation.x = (walking ? Math.max(0, -sw * sgn) * 0.9 : 0) * (1 - sb) + (Math.PI / 2) * sb;
    }
    // tay
    this.armL.top.rotation.x = -sw * 0.6 * (1 - sb) - 0.7 * sb; this.armL.knee.rotation.x = -0.15 - 0.5 * sb;
    let ar = sw * 0.6 * (1 - sb) - 0.7 * sb, ak = -0.15 - 0.5 * sb;
    if (this.carry && !sitting) { ar = -0.9; ak = -1.2; }
    if (sitting) {
      this.drinkT -= dt;
      if (this.drinkT <= 0) { this.drinkAnim = 1.6; this.drinkT = 5 + Math.random() * 9; }
    }
    if (this.drinkAnim > 0) { this.drinkAnim -= dt; const k = Math.sin(Math.min(1, this.drinkAnim / 1.6) * Math.PI); ar = -1.0 * k + ar * (1 - k); ak = -1.7 * k + ak * (1 - k); }
    if (this.callAnim > 0) { this.callAnim -= dt; const k = Math.sin(Math.min(1, this.callAnim / 1.4) * Math.PI); ar = -2.8 * k + ar * (1 - k); ak = -0.3 * k + ak * (1 - k); }
    this.armR.top.rotation.x = ar; this.armR.knee.rotation.x = ak;
    if (this.bubble) { this.bubbleT -= dt; if (this.bubbleT <= 0) { g.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble.material.dispose(); this.bubble = null; } else if (camera) scaleByDistance(this.bubble, camera, 22, 3.4); }
    if (this.tag && camera) scaleByDistance(this.tag, camera, 24, 3.0);
  }
}

// ---------- chó ----------
export class Dog {
  constructor() {
    this.group = new THREE.Group();
    const c = mat(0xc98a4b), d = mat(0x8a5a2b);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.62), c); body.position.y = 0.38; this.group.add(body);
    this.head = new THREE.Group(); this.head.position.set(0, 0.55, 0.36); this.group.add(this.head);
    const hm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.22), c); this.head.add(hm);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.14), d); snout.position.set(0, -0.03, 0.16); this.head.add(snout);
    for (const x of [-0.08, 0.08]) { const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), d); ear.position.set(x, 0.12, -0.02); this.head.add(ear); }
    this.tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.28), d); this.tail.position.set(0, 0.5, -0.36); this.tail.rotation.x = 0.7; this.group.add(this.tail);
    this.legs = [];
    for (const [x, z] of [[-0.1, 0.22], [0.1, 0.22], [-0.1, -0.22], [0.1, -0.22]]) {
      const lg = new THREE.Group(); lg.position.set(x, 0.28, z); const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.28, 0.07), d); m.position.y = -0.14; lg.add(m); this.group.add(lg); this.legs.push(lg);
    }
    const sh = new THREE.Mesh(G.blob, blobMat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; sh.scale.setScalar(0.8); this.group.add(sh);
    this.path = []; this.speed = 1.5; this.phase = 0; this.mode = 'idle'; this.modeT = 2; this.heading = 0; this.t = 0;
    this.bubble = null; this.bubbleT = 0; this.onBark = null; this.barkT = 0;
  }
  walkTo(pts) { this.path = pts.map((p) => ({ x: p.x, z: p.z })); this.mode = 'walk'; }
  bark(text = 'Gâu gâu!') {
    this.onBark?.();
    if (this.bubble) { this.group.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble.material.dispose(); }
    this.bubble = textSprite(text, { size: 34, worldH: 0.4, fg: '#2a1a00', bg: 'rgba(255,255,255,0.93)', pad: 10, radius: 16 });
    this.bubble.position.y = 1.05; this.group.add(this.bubble); this.bubbleT = 1.2;
    this.head.rotation.x = -0.35;
  }
  update(dt, camera) {
    this.t += dt; const g = this.group;
    this.head.rotation.x *= 0.9;
    this.tail.rotation.y = Math.sin(this.t * (this.mode === 'beg' ? 18 : 6)) * 0.6;
    if (this.mode === 'walk') {
      const p = this.path[0];
      if (!p) { this.mode = 'arrived'; }
      else {
        const dx = p.x - g.position.x, dz = p.z - g.position.z, d = Math.hypot(dx, dz), st = this.speed * dt;
        if (d <= st) { g.position.x = p.x; g.position.z = p.z; this.path.shift(); }
        else { g.position.x += dx / d * st; g.position.z += dz / d * st; this.heading = Math.atan2(dx, dz); }
        let dr = this.heading - g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); g.rotation.y += dr * Math.min(1, dt * 10);
        this.phase += dt * 11;
      }
      g.position.y = groundY(g.position.x, g.position.z);
    }
    this.legs.forEach((l, i) => { l.rotation.x = this.mode === 'walk' ? Math.sin(this.phase + (i % 2 ? Math.PI : 0)) * 0.7 : 0; });
    if (this.mode === 'beg') { this.group.children[0].position.y = 0.38; }
    if (this.bubble) { this.bubbleT -= dt; if (this.bubbleT <= 0) { g.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble.material.dispose(); this.bubble = null; } else if (camera) scaleByDistance(this.bubble, camera, 24, 3); }
  }
}

// ---------- xe máy, ô tô ----------
export function makeBike(color = 0xcc2a2a, withRider = true, riderId = '', riderName = '') {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 1.25), mat(color)); body.position.y = 0.55; g.add(body);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.55), mat(0x1a1a1a)); seat.position.set(0, 0.76, -0.1); g.add(seat);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.06), mat(0x222222)); bar.position.set(0, 0.98, 0.5); g.add(bar);
  const wg = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 14); wg.rotateZ(Math.PI / 2);
  for (const z of [0.55, -0.55]) { const w = new THREE.Mesh(wg, mat(0x151515)); w.position.set(0, 0.3, z); g.add(w); }
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0xfff4c0 })); lamp.position.set(0, 0.92, 0.66); g.add(lamp);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2020 })); tail.position.set(0, 0.66, -0.68); g.add(tail);
  let rider = null;
  if (withRider) {
    rider = new Person({ id: riderId || String(Math.random()), name: riderName, role: 'npc', tag: !!riderName });
    rider.state = 'sit'; rider.sitBlend = 1; rider.group.position.set(0, 0.5, -0.12);
    rider.armR.top.rotation.x = -1.2; rider.armL.top.rotation.x = -1.2;
    g.add(rider.group);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(0x222222)); helmet.position.set(0, 1.58, 0); rider.body.add(helmet);
  }
  return { group: g, rider };
}

export function makeCar(color = 0x2d6fd0) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4.2), mat(color, { metalness: 0.4, roughness: 0.4 })); body.position.y = 0.6; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.55, 2.1), mat(0x9fb8d8, { metalness: 0.6, roughness: 0.2 })); cab.position.set(0, 1.12, -0.15); g.add(cab);
  const wg = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 14); wg.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) { const w = new THREE.Mesh(wg, mat(0x151515)); w.position.set(x, 0.34, z); g.add(w); }
  for (const x of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff4c0 })); hl.position.set(x, 0.66, 2.11); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0xff2020 })); tl.position.set(x, 0.66, -2.11); g.add(tl);
  }
  return { group: g };
}

// ---------- xe đẩy hàng rong ----------
export function makeCart() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.7), mat(0xe8e1cf)); box.position.set(0, 0.85, 1.0); g.add(box);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.35 })); glass.position.set(0, 1.45, 1.0); g.add(glass);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), mat(0x444444)); pole.position.set(0, 1.5, 1.0); g.add(pole);
  const um = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.35, 12), mat(0xe03a3a)); um.position.set(0, 2.45, 1.0); g.add(um);
  const wg = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 12); wg.rotateZ(Math.PI / 2);
  for (const x of [-0.5, 0.5]) { const w = new THREE.Mesh(wg, mat(0x202020)); w.position.set(x, 0.28, 1.0); g.add(w); }
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd36b })); lantern.position.set(0.0, 2.2, 1.0); g.add(lantern);
  return g;
}

// ---------- món ăn / bia ----------
export function makeItemMesh(item) {
  const g = new THREE.Group();
  const plate = (r = 0.17, col = 0xf4f4f4) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.025, 16), mat(col)); p.position.y = 0.0125; return p; };
  if (item === 'bia') {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.15, 12), new THREE.MeshStandardMaterial({ color: 0xe8a317, transparent: true, opacity: 0.88, roughness: 0.2 }));
    glass.position.y = 0.075; g.add(glass);
    const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.058, 0.035, 12), mat(0xfffaf0)); foam.position.y = 0.16; g.add(foam);
  } else if (item === 'lac') {
    g.add(plate());
    for (let i = 0; i < 16; i++) { const n = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), mat(0xb8793a)); const a = Math.random() * 6.28, r = Math.random() * 0.1; n.position.set(Math.cos(a) * r, 0.045 + Math.random() * 0.03, Math.sin(a) * r); n.scale.y = 0.8; g.add(n); }
  } else if (item === 'dau') {
    g.add(plate(0.2));
    for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.08), mat(0xe8d9a0)); t.position.set(-0.08 + i * 0.08, 0.05, (i % 2) * 0.03); g.add(t); const o = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.02), mat(0x4ea83c)); o.position.set(-0.08 + i * 0.08, 0.078, (i % 2) * 0.03); g.add(o); }
  } else if (item === 'bo') {
    g.add(plate(0.21));
    for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.05), mat(i % 3 ? 0x7a2e1c : 0x9a4a2a)); const a = Math.random() * 6.28, r = Math.random() * 0.1; m.position.set(Math.cos(a) * r, 0.04 + Math.random() * 0.03, Math.sin(a) * r); m.rotation.y = Math.random() * 3; g.add(m); }
    for (let i = 0; i < 4; i++) { const o = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.1), mat(0x57b04a)); o.position.set((Math.random() - 0.5) * 0.2, 0.08, (Math.random() - 0.5) * 0.2); g.add(o); }
  } else if (item === 'lau') {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.18, 16), mat(0x2a2a2a, { metalness: 0.6 })); pot.position.y = 0.09; g.add(pot);
    const broth = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 16), mat(0xd9542b, { emissive: 0x5a1a00 })); broth.position.y = 0.17; g.add(broth);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 8), mat(0x555555)); stand.position.y = -0.0; g.add(stand);
  }
  return g;
}
