// Máy chủ cầu nối: phục vụ trang 3D + nhận sự kiện TikTok Live -> đẩy xuống trình duyệt qua WebSocket
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');

const app = express();
app.use(express.json());
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three')));
app.use(express.static(PUBLIC));

// Danh sách file âm thanh trong public/audio/* (trình duyệt sẽ tự nạp)
app.get('/api/audio-manifest', (_req, res) => {
  const exts = /\.(mp3|wav|ogg|m4a|aac)$/i;
  const out = {};
  for (const dir of ['bgm', 'sfx', 'voice']) {
    const full = path.join(PUBLIC, 'audio', dir);
    try {
      out[dir] = fs.readdirSync(full).filter((f) => exts.test(f)).sort().map((f) => `/audio/${dir}/${encodeURIComponent(f)}`);
    } catch {
      out[dir] = [];
    }
  }
  res.json(out);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set();

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of clients) if (ws.readyState === 1) ws.send(data);
}

let status = { state: 'idle', username: null, info: '' };
function setStatus(state, info = '', username = status.username) {
  status = { state, info, username };
  console.log(`[tiktok] ${state}${username ? ' @' + username : ''} ${info}`);
  broadcast({ type: 'status', ...status });
}

let conn = null;
let retryTimer = null;

function disconnect() {
  clearTimeout(retryTimer);
  if (conn) {
    try { conn.disconnect(); } catch { /* bỏ qua */ }
    conn = null;
  }
}

async function connect(username) {
  username = String(username || '').replace(/^@/, '').trim();
  if (!username) return setStatus('idle', 'Chưa nhập username');
  disconnect();
  setStatus('connecting', '', username);
  const c = new TikTokLiveConnection(username);
  conn = c;

  const userOf = (d) => ({
    userId: String(d.user?.userId ?? d.user?.uniqueId ?? ''),
    uniqueId: d.user?.uniqueId || '',
    nickname: d.user?.nickname || d.user?.uniqueId || 'Khách',
  });

  c.on(WebcastEvent.CHAT, (d) => {
    if (!d.comment) return;
    broadcast({ type: 'chat', ...userOf(d), comment: d.comment });
  });
  c.on(WebcastEvent.GIFT, (d) => {
    const isStreak = d.giftDetails?.giftType === 1;
    if (isStreak && !d.repeatEnd) return; // chuỗi quà đang chạy: đợi kết thúc mới tính
    const per = Number(d.giftDetails?.diamondCount ?? 0);
    const count = Number(d.repeatCount ?? 1) || 1;
    broadcast({
      type: 'gift',
      ...userOf(d),
      giftName: d.giftDetails?.giftName || 'Quà',
      diamonds: per * count,
      count,
    });
  });
  c.on(WebcastEvent.MEMBER, (d) => broadcast({ type: 'join', ...userOf(d) }));
  c.on(WebcastEvent.STREAM_END, () => setStatus('ended', 'Livestream đã kết thúc'));
  c.on(ControlEvent.DISCONNECTED, () => {
    if (conn !== c) return;
    setStatus('disconnected', 'Mất kết nối, thử lại sau 10 giây');
    retryTimer = setTimeout(() => connect(username), 10000);
  });
  c.on(ControlEvent.ERROR, ({ info }) => console.warn('[tiktok] lỗi:', info));

  try {
    const state = await c.connect();
    setStatus('connected', `Phòng ${state.roomId}`, username);
  } catch (err) {
    setStatus('error', String(err?.message || err), username);
    retryTimer = setTimeout(() => connect(username), 15000);
  }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'status', ...status }));
  ws.on('close', () => clients.delete(ws));
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'connect') connect(m.username);
    else if (m.type === 'disconnect') { disconnect(); setStatus('idle'); }
    else if (['chat', 'gift', 'join'].includes(m.type)) broadcast({ ...m, simulated: true }); // bảng thử nghiệm
  });
});

server.listen(PORT, () => {
  console.log(`\n  Quán nhậu 3D chạy tại  http://localhost:${PORT}`);
  console.log(`  Chế độ thử (bot tự chat): http://localhost:${PORT}/?demo=1\n`);
  const user = process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || process.env.TIKTOK_USER;
  if (user) connect(user);
  else console.log('  Chưa có username TikTok. Chạy:  npm start -- tenban   (hoặc nhập trong bảng điều khiển, phím D)\n');
});
