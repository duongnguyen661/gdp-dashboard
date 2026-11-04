// Logic quán nhậu thuần (không phụ thuộc 3D) — chạy được cả trong Node để kiểm thử.
import { CONFIG as DEFAULT_CONFIG } from './config.js';

export const strip = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim();

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const NUM_WORDS = { mot: 1, hai: 2, ba: 3, bon: 4, nam: 5 };

export class Tavern {
  constructor(hooks = {}, config = DEFAULT_CONFIG, now = () => Date.now()) {
    this.cfg = config;
    this.hooks = hooks;
    this.now = now;
    this.totalSeats = config.tables * config.seatsPerTable;
    this.seats = new Array(this.totalSeats + 1).fill(null); // seats[1..80] = userId
    this.guests = new Map();      // userId -> guest (đang ngồi)
    this.spectators = new Map();  // userId -> {userId, name} (đứng vỉa hè)
    this.tables = Array.from({ length: config.tables + 1 }, () => ({ freePlateUsed: false, lastFullAnnounce: -Infinity }));
    this.stats = { served: 0 };
  }

  emit(name, ...args) { this.hooks[name]?.(...args); }
  tableOf(seat) { return Math.ceil(seat / this.cfg.seatsPerTable); }
  seatsOfTable(t) { const n = this.cfg.seatsPerTable; return Array.from({ length: n }, (_, i) => (t - 1) * n + i + 1); }
  occupancy() { return this.guests.size / this.totalSeats; }
  tableCount(t) { return this.seatsOfTable(t).filter((s) => this.seats[s]).length; }

  say(who, text, extra = {}) { this.emit('speech', { who, text, ...extra }); }

  // ---- người xem ----
  touchSpectator(user) {
    if (this.guests.has(user.userId)) return;
    if (!this.spectators.has(user.userId)) {
      this.spectators.set(user.userId, { userId: user.userId, name: user.nickname || user.uniqueId || 'Khách' });
      this.emit('spectatorAdd', this.spectators.get(user.userId));
      while (this.spectators.size > this.cfg.maxSpectators) {
        const oldest = this.spectators.keys().next().value;
        this.spectators.delete(oldest);
        this.emit('spectatorRemove', oldest);
      }
    }
  }

  // ---- sự kiện từ TikTok ----
  onJoin(user) { if (user.userId) this.touchSpectator(user); }

  onChat(user, comment) {
    if (!user.userId) return;
    const guest = this.guests.get(user.userId);
    if (guest) return this.handleOrderComment(guest, comment);
    this.touchSpectator(user);
    this.handleSeatComment(user, comment);
  }

  onGift(user, gift) {
    const guest = this.guests.get(user.userId);
    if (!guest) { this.touchSpectator(user); return; } // chưa vào bàn -> không nhận
    const d = Math.max(0, Math.floor(gift.diamonds || 0));
    if (d <= 0) return;
    guest.paid = true;
    guest.lastActive = this.now();
    const m = this.cfg.menu;
    let item, qty = 1;
    if (guest.pending && d >= m[guest.pending].gift) { item = guest.pending; }
    else if (d >= m.lau.gift) item = 'lau';
    else if (d >= m.bo.gift) item = 'bo';
    else if (d >= m.dau.gift) item = 'dau';
    else if (d >= m.lac.gift) item = 'lac';
    else { item = 'bia'; qty = Math.min(d, this.cfg.maxPerOrder); }
    guest.pending = null;
    this.emit('gift', guest, gift);
    this.placeOrder(guest, item, qty, { free: false, viaGift: true, giftName: gift.giftName });
  }

  // ---- vào bàn ----
  handleSeatComment(user, comment) {
    const t = strip(comment);
    let m;
    let seat = null;
    let table = null;
    if ((m = t.match(/^(?:ghe\s*)?(?:so\s*)?(\d{1,2})$/))) seat = Number(m[1]);
    else if ((m = t.match(/^ban\s*(?:so\s*)?(\d{1,2})$/))) table = Number(m[1]);
    else return; // comment không phải số ghế -> không nhận

    if (table !== null) {
      if (table < 1 || table > this.cfg.tables) return;
      const free = this.seatsOfTable(table).find((s) => !this.seats[s]);
      if (!free) return this.announceFull(table);
      seat = free;
    }
    if (seat < 1 || seat > this.totalSeats) return;
    const tb = this.tableOf(seat);
    if (this.tableCount(tb) >= this.cfg.seatsPerTable) return this.announceFull(tb);
    if (this.seats[seat]) {
      this.say('staff', `Ghế ${seat} có người ngồi rồi, anh chọn ghế khác nhé!`, { voice: 'nhanvien_ghe_co_nguoi', table: tb });
      return;
    }
    this.seatGuest(user, seat);
  }

  announceFull(tb) {
    const now = this.now();
    const T = this.tables[tb];
    if (now - T.lastFullAnnounce < this.cfg.tableFullThrottleSec * 1000) return;
    T.lastFullAnnounce = now;
    this.say('staff', `Bàn ${tb} full rồi anh em ơi!`, { voice: 'nhanvien_ban_full', table: tb });
    this.emit('tableFull', tb);
  }

  seatGuest(user, seat) {
    this.spectators.delete(user.userId); // cảnh 3D tự giải phóng chỗ đứng khi nhận guestSeated
    const table = this.tableOf(seat);
    const guest = {
      userId: user.userId,
      name: user.nickname || user.uniqueId || 'Khách',
      seat, table,
      joinedAt: this.now(),
      lastActive: this.now(),
      freeBeersLeft: this.cfg.freeBeersPerPerson,
      paid: false,
      pending: null,
      lastHint: -Infinity,
    };
    this.guests.set(guest.userId, guest);
    this.seats[seat] = guest.userId;
    this.emit('guestSeated', guest);
    this.say('staff', `Mời ${guest.name} vào bàn ${table}, ghế ${seat}!`, { voice: 'nhanvien_moi_ngoi', table });
  }

  // ---- gọi món bằng comment ----
  parseOrders(comment) {
    const t = strip(comment);
    const out = [];
    const has = (list) => list.some((a) => new RegExp(`(^|\\s)${a}(\\s|$)`).test(t));
    const menu = this.cfg.menu;
    // bia (có số lượng)
    if (has(menu.bia.aliases)) {
      let qty = 1;
      const q = t.match(/(\d+|mot|hai|ba|bon|nam)\s*(?:ly|coc|chai|lon)?\s*(?:bia|beer)/);
      if (q) qty = /^\d+$/.test(q[1]) ? Number(q[1]) : NUM_WORDS[q[1]];
      out.push({ item: 'bia', qty: Math.min(Math.max(qty, 1), this.cfg.maxPerOrder) });
    }
    if (has(menu.lau.aliases)) out.push({ item: 'lau', qty: 1 });
    else if (has(menu.bo.aliases)) out.push({ item: 'bo', qty: 1 });
    if (has(menu.dau.aliases)) out.push({ item: 'dau', qty: 1 });
    if (has(menu.lac.aliases)) out.push({ item: 'lac', qty: 1 });
    return out;
  }

  handleOrderComment(guest, comment) {
    const orders = this.parseOrders(comment);
    if (!orders.length) return; // comment không phải gọi món -> không nhận
    guest.lastActive = this.now();
    for (const o of orders) this.orderByComment(guest, o.item, o.qty);
  }

  orderByComment(guest, item, qty) {
    const m = this.cfg.menu;
    const T = this.tables[guest.table];
    if (item === 'bia') {
      if (guest.freeBeersLeft <= 0) return this.hint(guest, `Hết 2 bia miễn phí rồi ${guest.name} ơi, thả quà ${m.bia.gift} xu là có bia ngay!`, 'nhanvien_het_bia_free');
      const n = Math.min(qty, guest.freeBeersLeft);
      guest.freeBeersLeft -= n;
      return this.placeOrder(guest, 'bia', n, { free: true });
    }
    if (item === 'lac' && !T.freePlateUsed && this.cfg.freePeanutPerTable > 0) {
      T.freePlateUsed = true;
      return this.placeOrder(guest, 'lac', 1, { free: true });
    }
    // món phải trả bằng quà
    guest.pending = item;
    this.hint(guest, `${cap(m[item].name)} là món mức quà ${m[item].gift} xu, ${guest.name} thả quà giúp em nhé!`, 'nhanvien_can_qua');
  }

  hint(guest, text, voice) {
    const now = this.now();
    if (now - guest.lastHint < 4000) return;
    guest.lastHint = now;
    this.say('staff', text, { voice, guest, table: guest.table });
  }

  placeOrder(guest, item, qty, opt) {
    const m = this.cfg.menu[item];
    const t = guest.table;
    this.stats.served += qty;
    // câu khách gọi
    let call, reply, arrive, voiceCall, voiceReply;
    if (item === 'bia') {
      call = qty === 1 ? 'Một bia em ơi!' : `${qty} bia em ơi!`;
      reply = qty === 1 ? `1 bia bàn số ${t}!` : `${qty} bia bàn số ${t}!`;
      arrive = pick([`Bia bàn ${t} đây, anh em uống vui nhé!`, `Bia lạnh tới rồi bàn ${t} ơi!`, `Bia của anh ${guest.name} đây ạ!`]);
      voiceCall = 'khach_bia'; voiceReply = 'nhanvien_bia';
    } else {
      call = pick([`Cho anh ${m.name} em ơi!`, `Em ơi, ${m.name} nhé!`]);
      reply = `${cap(m.name)} bàn số ${t} ra ngay!`;
      arrive = opt.free && item === 'lac'
        ? `Đĩa lạc tặng bàn ${t} đây, anh em nhậu vui nhé!`
        : pick([`${cap(m.name)} nóng hổi tới bàn ${t} rồi!`, `${cap(m.name)} của bàn ${t} đây ạ, mời anh em!`]);
      voiceCall = 'khach_mon'; voiceReply = 'nhanvien_nhan_mon';
    }
    this.say('guest', call, { guest, voice: voiceCall, table: t });
    this.say('staff', reply, { voice: voiceReply, table: t, delay: 1400 });
    this.emit('order', { guest, item, qty, table: t, seat: guest.seat, free: !!opt.free, viaGift: !!opt.viaGift, arrive, voiceArrive: item === 'bia' ? 'nhanvien_mang_bia' : 'nhanvien_mang_mon' });
  }

  // ---- đồng hồ ----
  tick() {
    const now = this.now();
    for (const g of [...this.guests.values()]) {
      if (!g.paid && now - g.joinedAt >= this.cfg.freeStaySec * 1000) this.removeGuest(g, 'kicked');
      else if (g.paid && now - g.lastActive >= this.cfg.paidStaySec * 1000) this.removeGuest(g, 'finished');
    }
  }

  remainingMs(g) {
    return g.paid ? null : Math.max(0, this.cfg.freeStaySec * 1000 - (this.now() - g.joinedAt));
  }

  removeGuest(g, reason) {
    this.guests.delete(g.userId);
    this.seats[g.seat] = null;
    if (reason === 'kicked') {
      this.emit('guestLeft', g, reason);
      this.say('owner', 'Anh em thông cảm, không order thì mời anh em đứng ngoài kia xem nhé!', { voice: 'chuquan_moi_xuong', guest: g });
    } else {
      this.emit('guestLeft', g, reason);
      this.say('staff', `Cảm ơn ${g.name} đã ủng hộ quán, hẹn gặp lại!`, { voice: 'nhanvien_cam_on', guest: g });
    }
    // người rời bàn trở thành người xem đứng ngoài vỉa hè
    this.touchSpectator({ userId: g.userId, nickname: g.name });
  }
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
