import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildWorld, L, tablePos } from './world.js';
import { Tavern } from './tavern.js';
import { Stage } from './stage.js';
import { AudioSystem } from './audio.js';
import { scaleByDistance } from './ui3d.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
if (qs.get('hud') === '0') document.body.classList.add('nohud');
const AUTOSTART = qs.get('obs') === '1' || qs.get('autostart') === '1';

// ---------- renderer / camera ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 1500);

// Phố chạy dọc trục z, ngã tư ở z=0, 20 bàn nằm ở z≈19..48 hai bên vỉa hè.
const CAMS = {
  tong: { pos: [0, 15, 3], look: [0, 1, 40], sway: 1.0 },          // nhìn dọc phố thấy cả 20 bàn
  thap: { pos: [0, 21, -30], look: [0, 22, 60], sway: 1.2 },       // nhà cao tầng + tháp Eiffel
  gan:  { pos: [0, 7.5, 6], look: [0, 1.5, 34], sway: 0.6 },
  cao:  { pos: [0, 70, 20], look: [0, 0, 32], sway: 0 },
  quay: { orbit: true },
  ban:  { follow: true },                                           // bám theo bàn vừa gọi món
};
// Chế độ tự động: lần lượt đổi góc quay, [tên cam, số giây]
const AUTO = [['thap', 9], ['tong', 12], ['ban', 9], ['gan', 10], ['quay', 14], ['ban', 9], ['cao', 7]];
let camMode = qs.get('cam') || 'auto', camT = 0, autoI = 0, autoT = 0;
let focusTable = 1, focusAt = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w / h < 1 ? 78 : 60; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
function setCam(m) { if (m === 'auto' || CAMS[m]) { camMode = m; autoI = 0; autoT = 0; } }
function pickFocusTable() {
  if (performance.now() - focusAt < 20000 && tavern.tableCount(focusTable)) return focusTable; // vừa có người gọi món
  const occ = []; for (let t = 1; t <= CONFIG.tables; t++) if (tavern.tableCount(t)) occ.push(t);
  return occ.length ? occ[Math.floor(Math.random() * occ.length)] : 1 + Math.floor(Math.random() * CONFIG.tables);
}
let curCam = null;
function updateCamera(dt) {
  camT += dt;
  let name = camMode;
  if (camMode === 'auto') {
    autoT += dt; if (autoT >= AUTO[autoI][1]) { autoT = 0; autoI = (autoI + 1) % AUTO.length; curCam = null; }
    name = AUTO[autoI][0];
  }
  if (name !== curCam) { curCam = name; if (name === 'ban') focusTable = pickFocusTable(); }
  const c = CAMS[name];
  let p, l;
  if (c.follow) {
    const tp = tablePos(focusTable), sx = Math.sign(tp.x);
    p = [tp.x - sx * 6.5, 4.2, tp.z - 8]; l = [tp.x, 1.2, tp.z + 0.5];
  } else if (c.orbit) {
    const a = camT * 0.12, cx = 0, cz = 35;
    p = [cx + Math.sin(a) * 26, 9, cz - Math.cos(a) * 26 - 6]; l = [0, 2, 33];
  } else {
    p = [c.pos[0] + Math.sin(camT * 0.15) * c.sway * 2, c.pos[1] + Math.sin(camT * 0.21) * c.sway * 0.5, c.pos[2]]; l = c.look;
  }
  camPos.lerp(new THREE.Vector3(...p), Math.min(1, dt * 1.6)); camLook.lerp(new THREE.Vector3(...l), Math.min(1, dt * 1.6));
  camera.position.copy(camPos); camera.lookAt(camLook);
}
camPos.set(...CAMS.thap.pos); camLook.set(...CAMS.thap.look);

// ---------- thế giới + logic ----------
const world = buildWorld(scene);
const audio = new AudioSystem();
const stage = new Stage(scene, world, audio, camera);

// ---------- HUD ----------
const feed = $('feed');
function caption(who, text, kind = 'sys') {
  const d = document.createElement('div'); d.className = 'k-' + kind;
  const i = document.createElement('i'); i.textContent = who + ':'; d.append(i, document.createTextNode(text));
  feed.append(d); while (feed.children.length > 4) feed.firstChild.remove();
  setTimeout(() => d.remove(), 14000);
}
stage.onCaption = caption;
$('ttl').textContent = '🍺 ' + CONFIG.streetName;
$('fs').textContent = Math.round(CONFIG.freeStaySec / 60 * 10) / 10;
$('menu').innerHTML = Object.values(CONFIG.menu).map((m) => `<tr><td>${m.name[0].toUpperCase() + m.name.slice(1)}</td><td>🎁 ${m.gift} xu</td></tr>`).join('');
const grid = $('grid'); const tbEls = [];
for (let t = 1; t <= CONFIG.tables; t++) {
  const d = document.createElement('div'); d.className = 'tb';
  const a = (t - 1) * CONFIG.seatsPerTable + 1, b = t * CONFIG.seatsPerTable;
  d.innerHTML = `<span><b>${t}</b><small>${a}-${b}</small></span><span>${'<i class="pip"></i>'.repeat(CONFIG.seatsPerTable)}</span>`;
  grid.append(d); tbEls.push(d);
}
function refreshMap() {
  tbEls.forEach((d, i) => {
    const n = tavern.tableCount(i + 1); d.classList.toggle('full', n >= CONFIG.seatsPerTable);
    d.querySelectorAll('.pip').forEach((p, k) => p.classList.toggle('on', k < n));
  });
}

const tavern = new Tavern({
  ...stage.hooks(),
  guestSeated: (g) => { stage.hooks().guestSeated(g); refreshMap(); },
  guestLeft: (g, r) => { stage.hooks().guestLeft(g, r); refreshMap(); },
  tableFull: (t) => { stage.hooks().tableFull(t); },
});
stage.tavern = tavern;
// hooks của stage dùng this => bind đúng
{
  const h = stage.hooks();
  tavern.hooks = {
    spectatorAdd: h.spectatorAdd, spectatorRemove: h.spectatorRemove, speech: h.speech, tableFull: h.tableFull,
    order: (o) => { h.order(o); focusTable = o.table; focusAt = performance.now(); },
    guestSeated: (g) => { h.guestSeated(g); refreshMap(); },
    guestLeft: (g, r) => { h.guestLeft(g, r); refreshMap(); },
  };
}
setInterval(() => { tavern.tick(); audio.setOccupancy(tavern.occupancy()); refreshMap(); }, 1000);
setInterval(() => { if (Math.random() < 0.5 && tavern.guests.size) audio.sfx('clink'); }, 7000);

// ---------- sự kiện đầu vào ----------
function handle(m) {
  const user = { userId: m.userId, uniqueId: m.uniqueId, nickname: m.nickname };
  if (m.type === 'chat') tavern.onChat(user, m.comment);
  else if (m.type === 'gift') tavern.onGift(user, { diamonds: m.diamonds, giftName: m.giftName });
  else if (m.type === 'join') tavern.onJoin(user);
}
const setStatus = (cls, txt) => { document.querySelector('#status .dot').className = 'dot ' + cls; $('stxt').textContent = txt; };
let ws;
function connectWs() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = () => setStatus('wait', 'Đã nối máy chủ');
  ws.onclose = () => { setStatus('err', 'Mất kết nối máy chủ'); setTimeout(connectWs, 2000); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'status') {
      const map = { connected: ['ok', `TikTok @${m.username}: đang live`], connecting: ['wait', `Đang nối @${m.username}…`], error: ['err', `Lỗi: ${m.info}`], disconnected: ['err', 'TikTok ngắt, đang nối lại…'], ended: ['err', 'Live đã kết thúc'], idle: ['wait', 'Chưa kết nối TikTok'] };
      const [c, t] = map[m.state] || ['wait', m.state]; setStatus(c, t);
    } else handle(m);
  };
}
if (location.protocol !== 'file:') connectWs();
const send = (o) => ws?.readyState === 1 ? ws.send(JSON.stringify(o)) : handle(o); // không có server vẫn chạy thử được

// ---------- bảng điều khiển ----------
const dev = $('dev');
addEventListener('keydown', (e) => {
  if (e.target.matches('input')) return;
  if (e.key === 'd' || e.key === 'D') dev.classList.toggle('show');
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('nohud');
  const m = { 0: 'auto', 1: 'tong', 2: 'gan', 3: 'quay', 4: 'cao', 5: 'thap', 6: 'ban' }[e.key]; if (m) setCam(m);
});
if (qs.get('dev') !== '0') dev.classList.add('show'); // mở sẵn bảng điều khiển; bấm nút ⚙ hoặc phím D để ẩn/hiện
$('devbtn').onclick = () => dev.classList.toggle('show');
// chọn giọng đọc
const vsel = $('voicesel');
audio.onVoices = () => {
  vsel.innerHTML = audio.voices.length ? '' : '<option>(máy chưa có giọng tiếng Việt – hãy mở bằng Microsoft Edge)</option>';
  const cur = audio.currentVoice();
  for (const v of audio.voices) { const o = document.createElement('option'); o.value = o.textContent = v.name; o.selected = v === cur; vsel.append(o); }
};
vsel.onchange = () => { audio.setVoice(vsel.value); audio.testVoice(); };
$('voicetest').onclick = () => audio.testVoice();
let simId = 1000;
const simUser = () => { const n = $('simname').value.trim() || 'Khách'; return { userId: 'sim_' + n, uniqueId: n, nickname: n }; };
$('simchat').onclick = () => handle({ type: 'chat', ...simUser(), comment: $('simtext').value });
$('simtext').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('simchat').click(); });
$('simjoin').onclick = () => handle({ type: 'join', ...simUser() });
dev.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => handle({ type: 'gift', ...simUser(), giftName: 'Quà thử', diamonds: Number(b.dataset.g) })));
dev.querySelectorAll('[data-cam]').forEach((b) => (b.onclick = () => setCam(b.dataset.cam)));
$('tkgo').onclick = () => send({ type: 'connect', username: $('tkuser').value });
$('tkstop').onclick = () => send({ type: 'disconnect' });
for (const [id, k] of [['vm', 'master'], ['vb', 'bgm'], ['vs', 'sfx'], ['vv', 'voice']]) $(id).oninput = (e) => audio.setVolume(k, Number(e.target.value));
$('tts').onchange = (e) => (audio.ttsOn = e.target.checked);
$('nextbgm').onclick = () => audio.nextBgm();

// ---------- bot demo ----------
const NAMES = ['Hùng', 'Lan', 'Tuấn', 'Mai', 'Bình', 'Dũng', 'Hà', 'Nam', 'Linh', 'Phúc', 'Trang', 'Khoa', 'Thảo', 'Đạt', 'Vy', 'Long', 'My', 'Sơn', 'Quỳnh', 'Hải'].map((n, i) => `${n}${i}`);
const botUsers = NAMES.map((n) => ({ userId: 'bot_' + n, uniqueId: n, nickname: n }));
let botTimer = null;
function botTick() {
  const u = botUsers[Math.floor(Math.random() * botUsers.length)];
  const seated = tavern.guests.has(u.userId), r = Math.random();
  if (!seated) { if (r < 0.2) handle({ type: 'join', ...u }); else if (r < 0.7) handle({ type: 'chat', ...u, comment: String(1 + Math.floor(Math.random() * CONFIG.tables * CONFIG.seatsPerTable)) }); else handle({ type: 'chat', ...u, comment: 'xin chào quán' }); }
  else if (r < 0.45) handle({ type: 'chat', ...u, comment: ['bia', 'cho 2 bia', 'lạc rang', 'đậu nướng mỡ hành', 'thịt bò', 'lẩu bò'][Math.floor(Math.random() * 6)] });
  else if (r < 0.6) handle({ type: 'gift', ...u, giftName: 'Hoa hồng', diamonds: [1, 1, 5, 10, 30, 99][Math.floor(Math.random() * 6)] });
}
function setBot(on) { clearInterval(botTimer); if (on) botTimer = setInterval(botTick, 1400); }
$('bot').onchange = (e) => setBot(e.target.checked);
if (qs.get('demo') === '1') { $('bot').checked = true; setBot(true); }

// ---------- khởi động ----------
function begin() { $('start').remove(); audio.start(); }
$('start').addEventListener('click', begin);
if (AUTOSTART) { begin(); }
window.__quan = { tavern, stage, world, audio, setCam, handle, camera, scene, renderer };

// ---------- vòng lặp ----------
let last = performance.now(), blink = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; blink += dt;
  stage.update(dt); updateCamera(dt);
  for (const k in world.seatLabels) { const s = world.seatLabels[k]; if (s.visible) scaleByDistance(s, camera, 26, 3.4); }
  for (const k in world.tableLabels) scaleByDistance(world.tableLabels[k], camera, 26, 3.4);
  world.eiffel.beacon.material.opacity = 0.55 + Math.sin(blink * 3) * 0.45;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
