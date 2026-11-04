// Dựng phố: ngã tư, vỉa hè, 20 bàn x 4 ghế, cột đèn + biển tên đường, nhà cao tầng, tháp Eiffel
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';
import { textSprite, radialTexture, drawLabel } from './ui3d.js';

export const L = {
  roadHalf: 5,        // nửa bề rộng đường
  swW: 4.5,           // bề rộng vỉa hè
  curbH: 0.15,        // độ cao vỉa hè
  tableX: 7.2,        // tâm bàn cách trục phố
  tableZ0: 19,        // bàn đầu tiên (gần ngã tư)
  tableDz: 3.2,       // khoảng cách giữa các bàn
  streetEnd: 75,
  streetStart: -70,
  eiffelZ: 150,
};
const SEAT_OFF = [[0, -0.85], [0.85, 0], [0, 0.85], [-0.85, 0]];

export const groundY = (x, z) => (Math.abs(x) < L.roadHalf || Math.abs(z) < L.roadHalf ? 0 : L.curbH);

// Bàn lẻ -> vỉa hè trái, bàn chẵn -> vỉa hè phải (bàn thấp số nằm gần ngã tư và camera)
export function tablePos(t) {
  const i = t - 1, row = Math.floor(i / 2), left = i % 2 === 0;
  return { x: left ? -L.tableX : L.tableX, z: L.tableZ0 + row * L.tableDz, left };
}
export function seatPos(n) {
  const per = CONFIG.seatsPerTable;
  const t = Math.ceil(n / per), k = (n - 1) % per;
  const tp = tablePos(t), [ox, oz] = SEAT_OFF[k];
  const x = tp.x + ox, z = tp.z + oz;
  return { table: t, k, x, z, y: L.curbH, faceY: Math.atan2(tp.x - x, tp.z - z) };
}
// chỗ nhân viên đứng phục vụ (phía đường, sát bàn)
export function serveSpot(t) {
  const tp = tablePos(t);
  return { x: tp.x - Math.sign(tp.x) * 1.5, z: tp.z + 0.1, y: L.curbH };
}
export const KITCHEN = { x: -8.5, z: 13.1, y: L.curbH };
export const OWNER_HOME = { x: -7.4, z: 11.0, y: L.curbH };

// vị trí người xem đứng ngoài vỉa hè (gần trước)
export const SPECTATOR_SPOTS = (() => {
  const s = [];
  // ưu tiên vỉa hè ngã tư (camera nhìn rõ nhất), rồi tới vỉa hè phía nam
  for (let x = 11; x < 40; x += 1.5) for (const z of [6.2, 8.4]) for (const sx of [-1, 1]) s.push({ x: sx * x, z });
  for (let z = -7.5; z > -34; z -= 1.5) for (const x of [-7.0, 7.0, -8.4, 8.4]) s.push({ x, z });
  return s.map((p) => ({ x: p.x + (Math.random() - 0.5) * 0.3, z: p.z + (Math.random() - 0.5) * 0.3, y: L.curbH }));
})();

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...o });
const rand = (a, b) => a + Math.random() * (b - a);
let seedN = 7;
const srand = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);

function windowTexture(cols, rows, tint) {
  const cell = 10, c = document.createElement('canvas');
  c.width = cols * cell; c.height = rows * cell;
  const g = c.getContext('2d');
  g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height);
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const lit = srand() < 0.45;
    g.fillStyle = lit ? (srand() < 0.7 ? '#ffd98a' : '#9fd4ff') : '#141a2a';
    g.fillRect(q * cell + 2, r * cell + 2, cell - 4, cell - 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}

function building(x, z, w, d, h, tint) {
  const cols = Math.max(2, Math.round(w / 2)), rows = Math.max(3, Math.round(h / 2.6));
  const tex = windowTexture(cols, rows, tint);
  const side = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.9 });
  const roof = std(0x20232e);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
  m.position.set(x, h / 2, z);
  return m;
}

export function buildWorld(scene) {
  const world = { tables: {}, seatLabels: {}, tableLabels: {}, blinkers: [], eiffelTop: null, lampPositions: [] };
  scene.background = new THREE.Color(0x070a1c);
  scene.fog = new THREE.Fog(0x0b1030, 90, 420);

  // ---- ánh sáng ----
  scene.add(new THREE.HemisphereLight(0x8a9ad8, 0x2a2030, 1.05));
  const moon = new THREE.DirectionalLight(0x9fb0ff, 0.9); moon.position.set(-40, 80, -30); scene.add(moon);
  const warm = new THREE.DirectionalLight(0xffb878, 0.55); warm.position.set(20, 30, -60); scene.add(warm);

  // ---- bầu trời + sao ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { a: { value: new THREE.Color(0x03040f) }, b: { value: new THREE.Color(0x1a1f4d) }, c: { value: new THREE.Color(0x5a3a5a) } },
    vertexShader: 'varying vec3 p; void main(){ p=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 p; uniform vec3 a,b,c; void main(){ float h=normalize(p).y; vec3 col=mix(c,b,smoothstep(0.0,0.25,h)); col=mix(col,a,smoothstep(0.2,0.8,h)); gl_FragColor=vec4(col,1.);}',
  }));
  scene.add(sky);
  const starPos = [];
  for (let i = 0; i < 700; i++) { const u = Math.random() * Math.PI * 2, v = Math.random() * 1.2 + 0.15; starPos.push(Math.cos(u) * 600 * Math.cos(v * 0.8), 600 * Math.sin(v * 0.9) + 40, Math.sin(u) * 600 * Math.cos(v * 0.8)); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })));

  // ---- mặt đất, đường, vỉa hè ----
  const base = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), std(0x22222a)); base.rotation.x = -Math.PI / 2; base.position.y = -0.02; scene.add(base);

  const roadTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#2c2e36'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${90 + Math.random() * 60},${90 + Math.random() * 60},${100 + Math.random() * 60},0.10)`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    g.fillStyle = '#e8d36a'; g.fillRect(124, 20, 8, 90); // vạch giữa
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const mainLen = L.streetEnd - L.streetStart;
  const mainTex = roadTex.clone(); mainTex.repeat.set(1, mainLen / 10); mainTex.needsUpdate = true;
  const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(10, mainLen), new THREE.MeshStandardMaterial({ map: mainTex, roughness: 0.95 }));
  mainRoad.rotation.x = -Math.PI / 2; mainRoad.position.set(0, 0.0, (L.streetEnd + L.streetStart) / 2); scene.add(mainRoad);
  const crossTex = roadTex.clone(); crossTex.repeat.set(1, 12); crossTex.needsUpdate = true;
  const crossRoad = new THREE.Mesh(new THREE.PlaneGeometry(10, 120), new THREE.MeshStandardMaterial({ map: crossTex, roughness: 0.95 }));
  crossRoad.rotation.x = -Math.PI / 2; crossRoad.rotation.z = Math.PI / 2; crossRoad.position.set(0, 0.01, 0); scene.add(crossRoad);
  const junction = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), std(0x2c2e36)); junction.rotation.x = -Math.PI / 2; junction.position.y = 0.02; scene.add(junction);
  // vạch qua đường
  const zebraMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
  for (const [cx, cz, alongX] of [[0, 6.2, true], [0, -6.2, true], [6.2, 0, false], [-6.2, 0, false]]) {
    for (let i = -4; i <= 4; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? 0.6 : 1.4, alongX ? 1.4 : 0.6), zebraMat); s.rotation.x = -Math.PI / 2; s.position.set(cx + (alongX ? i * 1.1 : 0), 0.03, cz + (alongX ? 0 : i * 1.1)); scene.add(s); }
  }
  // vỉa hè
  const swMat = std(0x77726d), curbMat = std(0xb8b2aa);
  const slab = (x0, x1, z0, z1) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, L.curbH, z1 - z0), swMat);
    m.position.set((x0 + x1) / 2, L.curbH / 2, (z0 + z1) / 2); scene.add(m);
  };
  const sw0 = L.roadHalf, sw1 = L.roadHalf + L.swW;
  for (const s of [-1, 1]) {
    const xa = s < 0 ? -sw1 : sw0, xb = s < 0 ? -sw0 : sw1;
    slab(xa, xb, 5, L.streetEnd); slab(xa, xb, L.streetStart, -5);
  }
  for (const s of [-1, 1]) for (const z of [[5, 9.5], [-9.5, -5]]) { slab(s < 0 ? -90 : sw1, s < 0 ? -sw1 : 90, z[0], z[1]); }
  // gờ vỉa hè sáng
  for (const s of [-1, 1]) for (const [za, zb] of [[5, L.streetEnd], [L.streetStart, -5]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.15, L.curbH + 0.02, zb - za), curbMat); c.position.set(s * (sw0 + 0.075), L.curbH / 2, (za + zb) / 2); scene.add(c);
  }

  // ---- nhà cao tầng ----
  const tints = ['#1c2236', '#252038', '#1b2a35', '#2a2230', '#202a3c'];
  const place = (x, z, w, d, h) => scene.add(building(x, z, w, d, h, tints[Math.floor(srand() * tints.length)]));
  // dãy 2 bên phố chính (phía bắc) — càng xa càng cao
  for (const s of [-1, 1]) {
    let z = 18; if (s < 0) z = 18;
    while (z < 125) {
      const w = 8 + srand() * 8, d = 9 + srand() * 6, h = 14 + srand() * 20 + Math.max(0, z - 40) * 0.45 + srand() * 18;
      place(s * (sw1 + 1 + w / 2 + srand() * 2), z + d / 2, w, d, h);
      z += d + 0.8 + srand() * 2;
    }
  }
  // dãy 2 bên phố chính (phía nam) + đường ngang — thấp hơn để không che camera
  for (const s of [-1, 1]) {
    let z = -12; while (z > -90) {
      const w = 8 + srand() * 7, d = 9 + srand() * 5, h = 10 + srand() * 22;
      place(s * (sw1 + 1 + w / 2), z - d / 2, w, d, h); z -= d + 1 + srand() * 2;
    }
    let x = 23; while (x < 95) {
      const w = 9 + srand() * 6, d = 10 + srand() * 5, h = 12 + srand() * 28 + Math.max(0, x - 40) * 0.3;
      place(s * (x + w / 2), 9.5 + 2 + d / 2, w, d, h); place(s * (x + w / 2), -9.5 - 2 - d / 2, w, d, h * 0.8); x += w + 1 + srand() * 2;
    }
  }
  // nền tòa nhà xa cuối phố (che đường chân trời)
  for (let i = -6; i <= 6; i++) { if (Math.abs(i) < 2) continue; place(i * 16, 112 + srand() * 10, 12 + srand() * 6, 12, 40 + srand() * 55); }

  // ---- quán nhậu ở góc ngã tư ----
  const tav = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(11, 5.2, 7), std(0xd9c9a8)); body.position.set(-15.5, 2.6, 13.1); tav.add(body);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x331a08, emissive: 0xff9a3a, emissiveIntensity: 1.1 });
  const kitchen = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 5.2), glowMat); kitchen.position.set(-9.95, 2.0, 13.1); tav.add(kitchen);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 5.2), std(0x7a4b2a)); counter.position.set(-9.5, 0.65, 13.1); tav.add(counter);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 5.8), std(0xb3261e)); awning.position.set(-9.0, 3.5, 13.1); awning.rotation.z = 0.22; tav.add(awning);
  const sign = textSprite('QUÁN NHẬU BIA HƠI', { size: 54, fg: '#ffe9a8', bg: '#b3261e', border: '#ffd45a', pad: 22, worldH: 1.5, scaleMode: 'fixed', radius: 10 });
  sign.position.set(-9.2, 5.9, 13.1); tav.add(sign);
  for (let i = 0; i < 3; i++) { const keg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.7, 12), std(0xc0c4cc, { metalness: 0.7, roughness: 0.35 })); keg.position.set(-9.2, 0.5, 11.0 + i * 0.7); tav.add(keg); }
  scene.add(tav);
  // cửa hàng đối diện (ngã tư)
  const shop = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 7), std(0x3a4a6a)); shop.position.set(15, 3, 13.1); scene.add(shop);
  const shopSign = textSprite('TẠP HÓA 24/7', { size: 46, fg: '#fff', bg: '#1f6f4a', pad: 18, worldH: 1.2, scaleMode: 'fixed', radius: 8 }); shopSign.position.set(9.9, 4.6, 13.1); scene.add(shopSign);

  // ---- bàn ghế ----
  const tableMats = [std(0xc8332b), std(0x2b64c8)];
  const stoolMats = [std(0xd94a3d), std(0x3d78d9), std(0xe0b030)];
  const topG = new THREE.BoxGeometry(1.15, 0.06, 1.15), legG = new THREE.CylinderGeometry(0.06, 0.09, 0.72, 8), stoolG = new THREE.CylinderGeometry(0.24, 0.2, 0.46, 12);
  const blob = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false });
  for (let t = 1; t <= CONFIG.tables; t++) {
    const tp = tablePos(t);
    const g = new THREE.Group(); g.position.set(tp.x, L.curbH, tp.z);
    const top = new THREE.Mesh(topG, tableMats[t % 2]); top.position.y = 0.74; g.add(top);
    const leg = new THREE.Mesh(legG, std(0x999999, { metalness: 0.6 })); leg.position.y = 0.36; g.add(leg);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), blob); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.01; g.add(sh);
    // số bàn to trên mặt bàn
    const tl = textSprite(`BÀN ${t}`, { size: 46, fg: '#fff', bg: 'rgba(0,0,0,0.55)', pad: 10, worldH: 0.5, scaleMode: 'dist' });
    tl.position.set(0, 2.55, 0); g.add(tl); world.tableLabels[t] = tl;
    for (let k = 0; k < CONFIG.seatsPerTable; k++) {
      const n = (t - 1) * CONFIG.seatsPerTable + k + 1;
      const [ox, oz] = SEAT_OFF[k];
      const st = new THREE.Mesh(stoolG, stoolMats[(t + k) % 3]); st.position.set(ox, 0.23, oz); g.add(st);
      const lab = textSprite(String(n), { size: 52, fg: '#111', bg: 'rgba(255,240,160,0.95)', pad: 8, radius: 14, worldH: 0.42, scaleMode: 'dist' });
      lab.position.set(ox * 1.15, 1.25, oz * 1.15); g.add(lab); world.seatLabels[n] = lab;
    }
    scene.add(g);
    world.tables[t] = { group: g, x: tp.x, z: tp.z, items: [] };
  }

  // ---- dây đèn chăng trên 2 dãy bàn ----
  const bulbG = new THREE.SphereGeometry(0.11, 8, 6);
  const bulbs = new THREE.InstancedMesh(bulbG, new THREE.MeshBasicMaterial({ color: 0xffe2a0 }), 140);
  let bi = 0; const dummy = new THREE.Object3D();
  const rowEnd = L.tableZ0 + 9 * L.tableDz + 1.6;
  const poleMat = std(0x444444, { metalness: 0.6 });
  for (const s of [-1, 1]) {
    const px = s * 9.3;
    const zs = []; for (let z = L.tableZ0 - 1.6; z <= rowEnd + 0.01; z += L.tableDz) zs.push(z);
    for (const z of zs) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 6), poleMat); p.position.set(px, 1.8 + L.curbH, z); scene.add(p); }
    for (let i = 0; i < zs.length - 1; i++) for (let j = 0; j < 7 && bi < 140; j++) {
      const f = j / 7, z = zs[i] + (zs[i + 1] - zs[i]) * f, sag = Math.sin(f * Math.PI) * 0.35;
      dummy.position.set(px - s * 0.0, 3.5 + L.curbH - sag, z); dummy.updateMatrix(); bulbs.setMatrixAt(bi++, dummy.matrix);
    }
  }
  bulbs.count = bi; scene.add(bulbs);

  // ---- cột đèn + biển tên đường ----
  const glowTex = radialTexture('rgba(255,210,140,0.95)', 'rgba(255,210,140,0)');
  const groundGlow = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,200,120,0.5)', 'rgba(255,200,120,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const lamp = (x, z, dir, withSign) => {
    const g = new THREE.Group(); g.position.set(x, L.curbH, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 8), std(0x30333a, { metalness: 0.7 })); pole.position.y = 3; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), std(0x30333a)); arm.position.set(dir * 0.6, 6, 0); g.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.26), new THREE.MeshBasicMaterial({ color: 0xfff1c8 })); head.position.set(dir * 1.2, 5.95, 0); g.add(head);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.set(4.5, 4.5, 1); glow.position.set(dir * 1.2, 5.8, 0); g.add(glow);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), groundGlow); pool.rotation.x = -Math.PI / 2; pool.position.set(dir * 1.2, 0.04, 0); g.add(pool);
    if (withSign) {
      const mk = (txt, rotY, ox, oz) => {
        const cv = document.createElement('canvas'); const { w, h } = drawLabel(cv, txt, { size: 60, fg: '#fff', bg: '#12409a', border: '#fff', pad: 16, radius: 6, weight: '800' });
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7 * (w / h), 0.7), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
        m.position.set(ox, 4.9, oz); m.rotation.y = rotY; g.add(m);
      };
      mk(CONFIG.streetName, 0, 0, 0.12); mk(CONFIG.crossStreetName, Math.PI / 2, 0.12, 0);
    }
    scene.add(g);
    world.lampPositions.push({ x: x + dir * 1.2, y: 6, z });
  };
  const sw = L.roadHalf + 0.35;
  lamp(sw, 6.0, 1, true);            // góc phố: có biển tên đường
  lamp(-sw, -6.0, -1, true);
  for (const z of [22, 38, 54, 70]) { lamp(-sw, z, 1, z === 38); lamp(sw, z + 8, -1, false); }
  for (const z of [-22, -40, -58]) { lamp(sw, z, -1, false); lamp(-sw, z - 6, 1, false); }

  // ---- tháp Eiffel ----
  world.eiffel = buildEiffel(scene, 140);
  return world;
}

function beam(p1, p2, r) {
  const dir = new THREE.Vector3().subVectors(p2, p1), len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, 5, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  const m = p1.clone().add(p2).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

function buildEiffel(scene, H) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const geos = [];
  const lv = [[0, 24], [0.26 * H, 14.5], [0.52 * H, 8.2], [0.74 * H, 4.2], [0.9 * H, 1.3]];
  const C = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (let i = 0; i < lv.length - 1; i++) {
    const [y0, h0] = lv[i], [y1, h1] = lv[i + 1];
    const r = 1.4 - i * 0.28;
    for (let c = 0; c < 4; c++) {
      const a = C[c], b = C[(c + 1) % 4];
      geos.push(beam(V(a[0] * h0, y0, a[1] * h0), V(a[0] * h1, y1, a[1] * h1), r));
      geos.push(beam(V(a[0] * h0, y0, a[1] * h0), V(b[0] * h1, y1, b[1] * h1), 0.3));
      geos.push(beam(V(b[0] * h0, y0, b[1] * h0), V(a[0] * h1, y1, a[1] * h1), 0.3));
      if (i > 0) geos.push(beam(V(a[0] * h0, y0, a[1] * h0), V(b[0] * h0, y0, b[1] * h0), 0.3));
    }
  }
  // vòm chân tháp
  const archH = 0.2 * H;
  for (let c = 0; c < 4; c++) {
    const a = C[c], b = C[(c + 1) % 4], h0 = lv[0][1];
    let prev = null;
    for (let s = 0; s <= 14; s++) {
      const f = s / 14, ang = f * Math.PI;
      const px = a[0] * h0 + (b[0] - a[0]) * h0 * f, pz = a[1] * h0 + (b[1] - a[1]) * h0 * f;
      const p = V(px, Math.sin(ang) * archH, pz);
      if (prev) geos.push(beam(prev, p, 0.7));
      prev = p;
    }
  }
  // sàn
  for (let i = 1; i <= 3; i++) { const [y, h] = lv[i]; const bx = new THREE.BoxGeometry(h * 2 + 3, 1.3, h * 2 + 3); bx.translate(0, y, 0); geos.push(bx); }
  const spire = new THREE.ConeGeometry(0.9, 0.1 * H, 6); spire.translate(0, 0.95 * H, 0); geos.push(spire);
  const merged = mergeGeometries(geos.map((g) => { g.deleteAttribute('uv'); return g; }), false);
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a5238, emissive: 0xff9a35, emissiveIntensity: 0.55, roughness: 0.7, fog: true });
  const tower = new THREE.Mesh(merged, mat);
  tower.position.set(0, 0, L.eiffelZ);
  scene.add(tower);
  // ánh sáng vàng quanh tháp + đèn hiệu trên đỉnh
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,170,70,0.55)', 'rgba(255,170,70,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.scale.set(H * 1.6, H * 1.8, 1); halo.position.set(0, H * 0.42, L.eiffelZ - 3); scene.add(halo);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  beacon.scale.set(14, 14, 1); beacon.position.set(0, H * 1.0, L.eiffelZ); scene.add(beacon);
  return { tower, halo, beacon, H };
}
