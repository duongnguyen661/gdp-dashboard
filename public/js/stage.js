// Điều phối cảnh: nối logic quán (Tavern) với nhân vật, nhân viên, chủ quán, chó, xe, hàng rong, xe ôm
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { L, tablePos, seatPos, serveSpot, groundY, KITCHEN, OWNER_HOME, SPECTATOR_SPOTS } from './world.js';
import { Person, Dog, makeBike, makeCar, makeCart, makeItemMesh } from './actors.js';
import { setSpriteText } from './ui3d.js';

const LANE = 4.6;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// đường đi từ lane (mép đường) vào chỗ ngồi
function approach(n) {
  const s = seatPos(n), tp = tablePos(s.table), side = Math.sign(tp.x), laneX = side * LANE;
  const ox = s.x - tp.x, oz = s.z - tp.z, seat = { x: s.x, z: s.z };
  if (Math.abs(oz) > 0.1) { const gz = tp.z + Math.sign(oz) * (L.tableDz / 2); return [{ x: laneX, z: gz }, { x: tp.x, z: gz }, seat]; }
  if (ox * -side > 0) return [{ x: laneX, z: tp.z }, seat];
  const gz = tp.z - L.tableDz / 2, farX = tp.x + side * 1.75;
  return [{ x: laneX, z: gz }, { x: farX, z: gz }, { x: farX, z: tp.z }, seat];
}
function routeToSeat(from, n) {
  const side = Math.sign(tablePos(seatPos(n).table).x), laneX = side * LANE, pts = [];
  if (Math.abs(from.x) > 9.6) pts.push({ x: laneX, z: 7.6 });
  else if (from.z < -5) { pts.push({ x: laneX, z: from.z }, { x: laneX, z: 14 }); }
  else pts.push({ x: laneX, z: from.z });
  return [...pts, ...approach(n)];
}
function routeFromSeat(n, spot) {
  const laneX = Math.sign(tablePos(seatPos(n).table).x) * LANE;
  const out = approach(n).slice(0, -1).reverse();
  out.push(spot.z < 0 ? { x: laneX, z: spot.z } : { x: laneX, z: 7.6 }, spot);
  return out;
}

export class Stage {
  constructor(scene, world, audio, camera) {
    this.scene = scene; this.world = world; this.audio = audio; this.camera = camera;
    this.people = new Map(); this.spotsUsed = new Map(); this.seatPerson = new Map();
    this.onCaption = () => {}; this.tavern = null;
    this.staff = []; this.jobs = []; this.ownerQ = []; this.ownerBusy = false; this.ownerLine = null;
    this.npcs = []; this.traffic = []; this.t = 0; this.tagT = 0;
    this.items = new Map();
    this.buildStaff(); this.buildNpcs(); this.buildTraffic(); this.buildDog(); this.buildVendor(); this.buildXeOm();
  }

  add(p) { this.scene.add(p.group); return p; }

  // ---------- nhân viên + chủ quán ----------
  buildStaff() {
    for (let i = 0; i < 3; i++) {
      const p = this.add(new Person({ id: 'staff' + i, name: `Nhân viên ${i + 1}`, role: 'staff', shirt: 0xb3261e }));
      p.speed = 2.1; p.home = { x: KITCHEN.x + 0.2, z: KITCHEN.z - 1.2 + i * 1.2 };
      p.placeAt(p.home.x, p.home.z); p.group.rotation.y = Math.PI / 2; p.busy = false; this.staff.push(p);
    }
    this.owner = this.add(new Person({ id: 'owner', name: 'Chủ quán', role: 'owner', shirt: 0x1d1d1d, scale: 1.1 }));
    this.owner.placeAt(OWNER_HOME.x, OWNER_HOME.z); this.owner.group.rotation.y = Math.PI / 2; this.owner.speed = 1.9;
  }

  // ---------- người đi đường ----------
  buildNpcs() {
    const lanes = [
      [{ x: -9.0, z: -55 }, { x: -9.0, z: 70 }], [{ x: 9.0, z: 70 }, { x: 9.0, z: -55 }],
      [{ x: -45, z: 7.6 }, { x: 45, z: 7.6 }], [{ x: 45, z: -7.6 }, { x: -45, z: -7.6 }],
      [{ x: -8.0, z: -50 }, { x: -8.0, z: -8 }], [{ x: 8.0, z: -8 }, { x: 8.0, z: -50 }],
    ];
    for (let i = 0; i < 10; i++) {
      const lane = lanes[i % lanes.length], p = this.add(new Person({ id: 'npc' + i, role: 'npc', tag: false }));
      p.speed = rnd(1.1, 1.7); const f = Math.random();
      p.placeAt(lane[0].x + (lane[1].x - lane[0].x) * f, lane[0].z + (lane[1].z - lane[0].z) * f);
      const go = (toEnd) => { const d = toEnd ? lane[1] : lane[0]; p.walkTo([d], () => setTimeout(() => go(!toEnd), rnd(500, 4000))); };
      go(Math.random() < 0.5); this.npcs.push(p);
    }
  }

  // ---------- xe cộ ----------
  buildTraffic() {
    const cols = [0xcc2a2a, 0x2d6fd0, 0xe0b030, 0x3a3a3a, 0xeeeeee, 0x2e9a5a, 0xd06a20];
    const lanesDef = [
      { axis: 'z', dir: 1, fix: -2.4, from: -68, to: 72 }, { axis: 'z', dir: -1, fix: 2.4, from: 72, to: -68 },
      { axis: 'x', dir: 1, fix: 2.4, from: -58, to: 58 }, { axis: 'x', dir: -1, fix: -2.4, from: 58, to: -58 },
    ];
    for (let i = 0; i < 12; i++) {
      const ln = lanesDef[i % 4], car = i % 5 === 0;
      const v = car ? makeCar(pick(cols)) : makeBike(pick(cols), true, 'rider' + i);
      const speed = car ? rnd(5, 8) : rnd(6, 10);
      const e = { ...v, ln, speed, car, s: rnd(Math.min(ln.from, ln.to), Math.max(ln.from, ln.to)) };
      this.scene.add(v.group); this.traffic.push(e);
    }
  }
  updateTraffic(dt) {
    for (const v of this.traffic) {
      const ln = v.ln; v.s += ln.dir * v.speed * dt;
      if ((ln.dir > 0 && v.s > Math.max(ln.from, ln.to)) || (ln.dir < 0 && v.s < Math.min(ln.from, ln.to))) {
        v.s = ln.from; if (!v.car && Math.random() < 0.3) this.audio.sfx('horn');
      }
      if (ln.axis === 'z') { v.group.position.set(ln.fix, 0, v.s); v.group.rotation.y = ln.dir > 0 ? 0 : Math.PI; }
      else { v.group.position.set(v.s, 0, ln.fix); v.group.rotation.y = ln.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      if (v.rider) v.rider.update(dt);
    }
  }

  // ---------- chó ----------
  buildDog() {
    this.dog = new Dog(); this.scene.add(this.dog.group);
    this.dog.group.position.set(-6, L.curbH, 22);
    this.dog.onBark = () => this.audio.sfx('dog');
    this.dog.modeT = 2;
  }
  updateDog(dt) {
    const d = this.dog; d.modeT -= dt;
    if (d.mode === 'arrived') { d.mode = 'beg'; d.modeT = rnd(5, 8); d.barkT = 0.5; }
    if (d.mode === 'beg') {
      d.barkT -= dt; if (d.barkT <= 0) { d.bark(pick(['Gâu gâu!', 'Gâu!', 'Ẳng ẳng~', 'Gâu gâu gâu!'])); d.barkT = rnd(1.4, 2.6); }
      if (d.modeT <= 0) d.mode = 'idle';
    }
    if (d.mode === 'idle') {
      d.modeT = Math.min(d.modeT, 0);
      const guests = [...this.tavern.guests.values()];
      let tx, tz;
      if (guests.length && Math.random() < 0.85) { const g = pick(guests), s = seatPos(g.seat), tp = tablePos(g.table); tx = s.x + (s.x - tp.x) * 0.6; tz = s.z + (s.z - tp.z) * 0.6; }
      else { const t = tablePos(1 + Math.floor(Math.random() * CONFIG.tables)); tx = t.x + rnd(-1.5, 1.5); tz = t.z + rnd(-1.4, 1.4); }
      tx = THREE.MathUtils.clamp(tx, -9.2, 9.2);
      const pos = d.group.position;
      d.walkTo([{ x: tx, z: pos.z }, { x: tx, z: tz }].filter((p) => !(Math.abs(p.x - pos.x) < 0.01 && Math.abs(p.z - pos.z) < 0.01)));
    }
    d.update(dt, this.camera);
  }

  // ---------- hàng rong ----------
  buildVendor() {
    this.vendor = this.add(new Person({ id: 'hangrong', name: 'Bán hàng rong', role: 'npc', shirt: 0xe8a62b }));
    this.vendor.speed = 0.9; const cart = makeCart(); this.vendor.group.add(cart); cart.position.set(0, 0, 0.2);
    this.vendor.placeAt(4.0, -30); this.vendor.callT = 6;
    const go = (north) => this.vendor.walkTo([{ x: north ? 3.9 : 3.9, z: north ? 62 : -35 }], () => setTimeout(() => go(!north), 2000));
    go(true);
  }
  // ---------- xe ôm ----------
  buildXeOm() {
    const b = makeBike(0x1c6b3a, true, 'xeom', 'Xe ôm'); this.xeom = b; this.scene.add(b.group);
    b.group.position.set(4.0, 0, -8.5); b.callT = 9; b.state = 'wait'; b.t = rnd(25, 45); b.s = -8.5; b.dir = 1;
  }
  updateXeOm(dt) {
    const b = this.xeom; b.t -= dt; b.callT -= dt;
    if (b.state === 'wait') {
      if (b.callT <= 0) { b.callT = rnd(14, 22); this.npcSpeak(b.rider, 'xeom', 'xeom', pick(['Anh ơi, đi xe ôm không anh?', 'Xe ôm đây, đi đâu em chở!'])); }
      if (b.t <= 0) { b.state = 'ride'; b.dir = 1; }
    } else {
      b.s += b.dir * 6 * dt; b.group.position.set(b.dir > 0 ? 3.9 : 3.9, 0, b.s); b.group.rotation.y = b.dir > 0 ? 0 : Math.PI;
      if (b.dir > 0 && b.s > 60) b.dir = -1;
      if (b.dir < 0 && b.s <= -8.5) { b.state = 'wait'; b.t = rnd(40, 80); b.group.rotation.y = 0; b.s = -8.5; }
    }
    b.rider.update(dt, this.camera);
  }
  npcSpeak(person, role, key, text) {
    person.say(text, 3800, 'npc'); this.audio.say({ role, text, keys: [key] }); this.onCaption(role === 'xeom' ? 'Xe ôm' : 'Bán hàng rong', text, 'npc');
  }

  // ---------- chỗ đứng người xem ----------
  allocSpot(id) {
    for (let i = 0; i < SPECTATOR_SPOTS.length; i++) if (!this.spotsUsed.has(i)) { this.spotsUsed.set(i, id); return { i, ...SPECTATOR_SPOTS[i] }; }
    return null;
  }
  freeSpot(id) { for (const [i, v] of this.spotsUsed) if (v === id) this.spotsUsed.delete(i); }
  faceStreet(p) {
    const q = p.group.position; p.group.rotation.y = Math.atan2(-q.x * 0.3, 30 - q.z);
  }

  // ---------- hooks nối với Tavern ----------
  hooks() {
    return {
      spectatorAdd: (s) => this.spectatorAdd(s),
      spectatorRemove: (id) => this.removePerson(id),
      guestSeated: (g) => this.guestSeated(g),
      guestLeft: (g, r) => this.guestLeft(g, r),
      speech: (ev) => this.onSpeech(ev),
      order: (o) => this.onOrder(o),
      tableFull: () => this.audio.sfx('horn'),
    };
  }
  removePerson(id) {
    const p = this.people.get(id); if (!p) return;
    if (p.role === 'guest') return;
    this.freeSpot(id); this.scene.remove(p.group); this.people.delete(id);
  }
  spectatorAdd(s) {
    let p = this.people.get(s.userId);
    if (p) { p.role = 'spectator'; p.setName(s.name); if (!p.spot) p.spot = this.allocSpot(s.userId); return; } // người vừa rời bàn: đi ra sau
    const spot = this.allocSpot(s.userId); if (!spot) return;
    p = this.add(new Person({ id: s.userId, name: s.name, role: 'spectator' }));
    p.speed = 3.2; p.spot = spot;
    if (spot.z < 0) p.placeAt(spot.x, spot.z - 28); else p.placeAt((spot.x < 0 ? -1 : 1) * 50, 7.6);
    this.people.set(s.userId, p);
    p.walkTo([spot], () => { p.speed = 1.4; this.faceStreet(p); });
  }
  guestSeated(g) {
    let p = this.people.get(g.userId);
    const old = this.seatPerson.get(g.seat);
    if (old && old !== p) this.evict(old); // ghế vừa trống mà người cũ chưa kịp rời đi
    if (!p) { p = this.add(new Person({ id: g.userId, name: g.name, role: 'guest' })); p.placeAt(-LANE, -20); this.people.set(g.userId, p); }
    this.freeSpot(g.userId);
    p.role = 'guest'; p.leaving = false; p.spot = null; p.speed = 2.0; p.guestRef = g; p.setName(g.name);
    this.seatPerson.set(g.seat, p);
    const sp = seatPos(g.seat);
    if (this.world.seatLabels[g.seat]) this.world.seatLabels[g.seat].visible = false;
    p.walkTo(routeToSeat(p.group.position, g.seat), () => { p.sitAt(sp); p.speed = 1.4; });
  }
  evict(p) {
    if (p.guestRef) { this.seatPerson.delete(p.guestRef.seat); }
    p.leaving = false; p.stand(); p.guestRef = null;
    if (p.spot) { p.placeAt(p.spot.x, p.spot.z); this.faceStreet(p); }
    p.state = 'stand';
  }
  guestLeft(g, reason) {
    const p = this.people.get(g.userId); if (!p) return;
    const lab = this.world.seatLabels[g.seat]; if (lab) lab.visible = true;
    p.leaving = true; p.guestRef = g;
    if (reason === 'kicked') this.ownerQ.push({ p, g });
    else this.walkOut(p, g.seat);
    // dọn bàn khi hết người
    setTimeout(() => { if (this.tavern.tableCount(g.table) === 0) this.clearTable(g.table); }, 2500);
  }
  walkOut(p, seatNo) {
    const spot = p.spot || this.allocSpot(p.id) || { x: 7, z: -10, y: L.curbH };
    p.spot = spot; p.stand();
    if (this.seatPerson.get(seatNo) === p) this.seatPerson.delete(seatNo);
    p.speed = 1.9; p.leaving = false;
    p.walkTo(routeFromSeat(seatNo, spot), () => { p.speed = 1.4; this.faceStreet(p); });
  }
  clearTable(t) {
    const rec = this.world.tables[t];
    for (const m of rec.items) rec.group.remove(m.mesh);
    rec.items.length = 0;
  }

  // ---------- thoại ----------
  onSpeech(ev) {
    const { who, text, guest } = ev;
    const say = () => {
      if (who === 'guest') { const p = this.people.get(guest?.userId); if (p) { p.say(text, 3200, 'guest'); p.call(); } this.audio.say({ role: 'guest', text, keys: [ev.voice] }); this.onCaption(guest?.name || 'Khách', text, 'guest'); }
      else if (who === 'staff') {
        const s = this.nearestStaff(ev.table); s.say(text, 3800, 'staff');
        this.audio.say({ role: 'staff', text, keys: [ev.table ? `${ev.voice}_ban${ev.table}` : null, ev.voice] }); this.onCaption('Nhân viên', text, 'staff');
      } else if (who === 'owner') { this.ownerLine = { text, voice: ev.voice }; }
    };
    if (who === 'owner') return say(); // chủ quán nói khi đã đi ra tới bàn
    ev.delay ? setTimeout(say, ev.delay) : say();
  }
  nearestStaff() { return this.staff.find((s) => !s.busy) || this.staff[0]; }

  // ---------- phục vụ món ----------
  onOrder(o) { this.jobs.push(o); }
  runJobs() {
    if (!this.jobs.length) return;
    const s = this.staff.find((x) => !x.busy); if (!s) return;
    const job = this.jobs.shift(); s.busy = true;
    const tray = new THREE.Group();
    for (let i = 0; i < (job.item === 'bia' ? job.qty : 1); i++) { const m = makeItemMesh(job.item); m.position.set(i * 0.12 - (job.qty - 1) * 0.06, 0, 0); tray.add(m); }
    tray.position.set(0, 0.05, 0.1); s.holdItem(tray); this.audio.sfx('clink');
    const sv = serveSpot(job.table), side = Math.sign(tablePos(job.table).x);
    const route = [{ x: -LANE, z: KITCHEN.z }];
    if (side > 0) route.push({ x: LANE, z: KITCHEN.z });
    route.push({ x: side * LANE, z: sv.z }, { x: sv.x, z: sv.z });
    s.walkTo(route, () => {
      s.group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      setTimeout(() => {
        s.clearHold(); this.placeItems(job);
        s.say(job.arrive, 3600, 'staff'); this.audio.say({ role: 'staff', text: job.arrive, keys: [`${job.voiceArrive}_ban${job.table}`, job.voiceArrive] }); this.onCaption('Nhân viên', job.arrive, 'staff');
        this.audio.sfx('clink');
        setTimeout(() => s.walkTo([{ x: side * LANE, z: sv.z }, { x: side * LANE, z: KITCHEN.z }, ...(side > 0 ? [{ x: -LANE, z: KITCHEN.z }] : []), s.home], () => { s.busy = false; s.group.rotation.y = Math.PI / 2; }), 900);
      }, 500);
    });
  }
  placeItems(job) {
    const rec = this.world.tables[job.table], sp = seatPos(job.seat), tp = tablePos(job.table);
    const dx = (sp.x - tp.x), dz = (sp.z - tp.z), y = 0.77;
    const n = job.item === 'bia' ? job.qty : 1;
    for (let i = 0; i < n; i++) {
      const m = makeItemMesh(job.item);
      if (job.item === 'bia') m.position.set(dx * 0.34 + (i - (n - 1) / 2) * 0.13 * (dz ? 1 : 0) + (dz ? 0 : (i - (n - 1) / 2) * 0.0), y, dz * 0.34 + (dx ? (i - (n - 1) / 2) * 0.13 : 0));
      else m.position.set(rnd(-0.22, 0.22), y, rnd(-0.22, 0.22));
      rec.group.add(m); rec.items.push({ mesh: m, seat: job.seat });
    }
    while (rec.items.length > 16) { const o = rec.items.shift(); rec.group.remove(o.mesh); }
  }

  // ---------- chủ quán ra đuổi khách ----------
  runOwner() {
    if (this.ownerBusy || !this.ownerQ.length) return;
    this.ownerBusy = true;
    const { p, g } = this.ownerQ.shift();
    const side = Math.sign(tablePos(g.table).x), sv = serveSpot(g.table), o = this.owner;
    o.walkTo([{ x: -LANE, z: OWNER_HOME.z }, ...(side > 0 ? [{ x: LANE, z: OWNER_HOME.z }] : []), { x: side * LANE, z: sv.z }, { x: sv.x, z: sv.z }], () => {
      o.group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      const line = this.ownerLine || { text: 'Anh em thông cảm, không order thì mời anh em đứng ngoài kia xem nhé!', voice: 'chuquan_moi_xuong' };
      this.ownerLine = null; o.say(line.text, 4800, 'owner'); o.call();
      this.audio.say({ role: 'owner', text: line.text, keys: [line.voice] }); this.onCaption('Chủ quán', line.text, 'owner');
      setTimeout(() => { this.walkOut(p, g.seat); }, 2200);
      setTimeout(() => { o.walkTo([{ x: side * LANE, z: sv.z }, { x: side * LANE, z: OWNER_HOME.z }, ...(side > 0 ? [{ x: -LANE, z: OWNER_HOME.z }] : []), OWNER_HOME], () => { o.group.rotation.y = Math.PI / 2; this.ownerBusy = false; }); }, 3600);
    });
  }

  // ---------- vòng lặp ----------
  update(dt) {
    this.t += dt; this.tagT += dt;
    const cam = this.camera;
    this.runJobs(); this.runOwner();
    for (const p of this.people.values()) p.update(dt, cam);
    for (const s of this.staff) s.update(dt, cam);
    this.owner.update(dt, cam);
    for (const n of this.npcs) n.update(dt);
    this.vendor.update(dt, cam); this.vendor.callT -= dt;
    if (this.vendor.callT <= 0) { this.vendor.callT = rnd(18, 28); this.npcSpeak(this.vendor, 'hangrong', 'hangrong', pick(['Ai bánh mì nóng giòn không!', 'Nem chua rán, lạc rang đây!', 'Ai trứng vịt lộn, bắp nướng không!'])); }
    this.updateTraffic(dt); this.updateDog(dt); this.updateXeOm(dt);
    if (this.tagT > 0.5) {
      this.tagT = 0;
      for (const g of this.tavern.guests.values()) {
        const p = this.people.get(g.userId); if (!p) continue;
        const rem = this.tavern.remainingMs(g);
        p.setName(rem === null ? `${g.name} ★` : `${g.name} ⏱${mmss(rem)}`, rem !== null && rem < 30000 ? { bg: 'rgba(200,40,40,0.85)' } : {});
      }
    }
  }
}
