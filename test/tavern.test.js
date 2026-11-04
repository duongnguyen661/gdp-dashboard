import assert from 'node:assert/strict';
import { Tavern } from '../public/js/tavern.js';
import { CONFIG } from '../public/js/config.js';

let clock = 0;
const log = { speech: [], orders: [], left: [], seated: [], full: [] };
const tv = new Tavern({
  speech: (s) => log.speech.push(s),
  order: (o) => log.orders.push(o),
  guestLeft: (g, r) => log.left.push([g.userId, r]),
  guestSeated: (g) => log.seated.push(g),
  tableFull: (t) => log.full.push(t),
}, CONFIG, () => clock);

const U = (id) => ({ userId: id, nickname: 'U' + id });

// 1. comment lạ khi chưa ngồi -> không nhận
tv.onChat(U('a'), 'hello mọi người');
assert.equal(tv.guests.size, 0);

// 2. vào bàn bằng số ghế
tv.onChat(U('a'), '5');
assert.equal(tv.guests.get('a').table, 2);
assert.equal(tv.guests.get('a').seat, 5);
tv.onChat(U('b'), 'ghế 6'); tv.onChat(U('c'), 'bàn 2'); tv.onChat(U('d'), '8');
assert.equal(tv.tableCount(2), 4);

// 3. bàn full -> thông báo, không nhận người thứ 5
tv.onChat(U('e'), '7');
assert.deepEqual(log.full, [2]);
assert.equal(tv.guests.has('e'), false);
tv.onChat(U('e'), '7'); // trong thời gian throttle không đọc lại
assert.deepEqual(log.full, [2]);

// 4. gọi bia: 2 ly free mỗi người, ly thứ 3 phải quà
tv.onChat(U('a'), 'cho 2 bia');
assert.equal(log.orders.at(-1).qty, 2);
assert.equal(log.orders.at(-1).free, true);
const n = log.orders.length;
tv.onChat(U('a'), 'bia');
assert.equal(log.orders.length, n); // hết free -> không ra bia
assert.ok(log.speech.at(-1).text.includes('Hết 2 bia miễn phí'));

// 5. 1 đĩa lạc free / bàn
tv.onChat(U('b'), 'lạc rang');
assert.equal(log.orders.at(-1).item, 'lac'); assert.equal(log.orders.at(-1).free, true);
const n2 = log.orders.length;
tv.onChat(U('c'), 'lạc');
assert.equal(log.orders.length, n2);
assert.equal(tv.guests.get('c').pending, 'lac');

// 6. quà: 1 xu = bia, 5 = lạc, 10 = đậu, 30 = bò, 99 = lẩu; pending ưu tiên
tv.onGift(U('a'), { diamonds: 1, giftName: 'Rose' });
assert.equal(log.orders.at(-1).item, 'bia');
tv.onGift(U('a'), { diamonds: 10 });
assert.equal(log.orders.at(-1).item, 'dau');
tv.onGift(U('a'), { diamonds: 30 });
assert.equal(log.orders.at(-1).item, 'bo');
// c đang chờ lạc (pending) -> quà đủ mức thì ra đúng món chờ
tv.onGift(U('c'), { diamonds: 100 });
assert.equal(log.orders.at(-1).item, 'lac');
// d không pending, 99 xu -> lẩu
tv.onGift(U('d'), { diamonds: 99 });
assert.equal(log.orders.at(-1).item, 'lau');

// 7. quà từ người chưa vào bàn -> không nhận
const n3 = log.orders.length;
tv.onGift(U('z'), { diamonds: 50 });
assert.equal(log.orders.length, n3);

// 8. sau 2 phút: người đã thả quà ở lại, người không thả quà bị mời xuống
tv.onChat(U('f'), '20');       // bàn 5 ghế 20, chỉ uống free
tv.onChat(U('f'), 'bia');
clock += 119 * 1000; tv.tick();
assert.equal(tv.guests.has('f'), true);
clock += 2 * 1000; tv.tick();
assert.equal(tv.guests.has('f'), false);
assert.deepEqual(log.left.filter(([id]) => id === 'f'), [['f', 'kicked']]);
assert.equal(log.speech.at(-1).who, 'owner');
assert.ok(log.speech.at(-1).text.includes('đứng ngoài kia xem'));
assert.equal(tv.spectators.has('f'), true);       // thành người xem ngoài vỉa hè
assert.equal(tv.seats[20], null);                 // ghế được trả lại
assert.equal(tv.guests.has('a'), true);           // a đã thả quà -> không bị đuổi

// 9. ghế trống lại cho người khác vào được
tv.onChat(U('g'), '20');
assert.equal(tv.guests.get('g').seat, 20);

console.log('OK - tất cả kiểm tra logic quán đều qua');
