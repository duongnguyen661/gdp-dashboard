// Âm thanh: nhạc nền, hiệu ứng, voice. Ưu tiên file người dùng bỏ vào public/audio/*, không có file thì tự tạo âm thanh tổng hợp + đọc bằng giọng máy (TTS).
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const base = (u) => decodeURIComponent(u.split('/').pop()).toLowerCase();

export class AudioSystem {
  constructor() {
    this.ctx = null; this.started = false;
    this.manifest = { bgm: [], sfx: [], voice: [] };
    this.vol = { master: 1, bgm: 0.35, sfx: 0.7, voice: 1 };
    this.occ = 0; this.loops = []; this.bgm = null; this.bgmList = []; this.ttsOn = true;
    this.lastSfx = {}; this.voices = [];
  }
  files(kind, prefix) {
    const p = prefix.toLowerCase(), specific = /_ban\d+/.test(p);
    return (this.manifest[kind] || []).filter((u) => { const b = base(u); return b.startsWith(p) && (specific || !/_ban\d+/.test(b)); });
  }
  hasFiles(kind, prefix) { return this.files(kind, prefix).length > 0; }

  async start() {
    if (this.started) return; this.started = true;
    try { this.manifest = await (await fetch('/api/audio-manifest')).json(); } catch { /* chạy không cần server */ }
    const AC = window.AudioContext || window.webkitAudioContext;
    try { this.ctx = new AC(); await this.ctx.resume(); } catch { this.ctx = null; }
    if (this.ctx) this.buildAmbience();
    this.startFileLoops();
    this.startBgm();
    if ('speechSynthesis' in window) {
      const load = () => { this.voices = speechSynthesis.getVoices().filter((v) => /^vi/i.test(v.lang)); this.onVoices?.(); };
      load(); speechSynthesis.onvoiceschanged = load;
    }
    this.apply();
  }

  // ---- âm thanh tổng hợp ----
  noise(type) {
    const ctx = this.ctx, len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; return s;
  }
  buildAmbience() {
    const ctx = this.ctx;
    this.mix = ctx.createGain(); this.mix.connect(ctx.destination);
    if (!this.hasFiles('sfx', 'traffic')) {
      const n = this.noise('brown'), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
      this.trafficGain = ctx.createGain(); n.connect(f); f.connect(this.trafficGain); this.trafficGain.connect(this.mix); n.start();
      this.trafficBase = 0.5;
    }
    if (!this.hasFiles('sfx', 'crowd') && !this.hasFiles('sfx', 'nhau')) {
      this.crowdGain = ctx.createGain(); this.crowdGain.gain.value = 0;
      for (const [fr, q] of [[480, 0.9], [900, 1.2], [1500, 1.5]]) {
        const n = this.noise('white'), b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = fr; b.Q.value = q;
        const g = ctx.createGain(); g.gain.value = 0.5; n.connect(b); b.connect(g); g.connect(this.crowdGain); n.start();
        setInterval(() => { g.gain.setTargetAtTime(0.15 + Math.random() * 0.85, ctx.currentTime, 0.25); }, 350 + Math.random() * 500); // xì xào lên xuống
      }
      this.crowdGain.connect(this.mix);
    }
  }
  tone(freq, dur, type = 'sine', gain = 0.2, slideTo = null) {
    if (!this.ctx) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(gain * this.vol.sfx * this.vol.master, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  // ---- file ----
  play(url, vol, loop = false) {
    const a = new Audio(url); a.loop = loop; a.volume = Math.min(1, Math.max(0, vol)); a.play().catch(() => {}); return a;
  }
  startFileLoops() {
    for (const f of [...this.files('sfx', 'traffic'), ...this.files('sfx', 'crowd'), ...this.files('sfx', 'nhau')]) {
      const name = base(f); const kind = name.startsWith('traffic') ? 'traffic' : /low|it|vang/.test(name) ? 'low' : /high|dong|full/.test(name) ? 'high' : 'mid';
      this.loops.push({ kind, a: this.play(f, 0, true) });
    }
  }
  startBgm() {
    this.bgmList = [...this.manifest.bgm].sort(() => Math.random() - 0.5);
    if (!this.bgmList.length) return;
    let i = 0;
    const next = () => { this.bgm = this.play(this.bgmList[i++ % this.bgmList.length], this.vol.bgm * this.vol.master); this.bgm.onended = next; };
    next();
  }
  nextBgm() { if (this.bgm) { this.bgm.onended = null; this.bgm.pause(); this.bgm = null; } this.startBgm(); }

  apply() {
    const m = this.vol.master, o = this.occ;
    if (this.bgm) this.bgm.volume = Math.min(1, this.vol.bgm * m);
    if (this.trafficGain) this.trafficGain.gain.value = 0.35 * this.vol.sfx * m;
    if (this.crowdGain) this.crowdGain.gain.setTargetAtTime((0.015 + Math.pow(o, 0.8) * 0.45) * this.vol.sfx * m, this.ctx.currentTime, 0.6);
    for (const l of this.loops) {
      let v = l.kind === 'traffic' ? 0.4 : l.kind === 'low' ? Math.max(0, 1 - o * 2.2) : l.kind === 'high' ? Math.min(1, Math.max(0, (o - 0.3) * 2)) : 0.1 + o * 0.9;
      l.a.volume = Math.min(1, v * this.vol.sfx * m);
    }
  }
  setOccupancy(o) { this.occ = o; this.apply(); }
  setVolume(kind, v) { this.vol[kind] = v; this.apply(); }

  // ---- hiệu ứng ngắn ----
  sfx(name) {
    const now = performance.now(); if (now - (this.lastSfx[name] || 0) < 250) return; this.lastSfx[name] = now;
    const f = this.files('sfx', name);
    if (f.length) { this.play(rand(f), this.vol.sfx * this.vol.master); return; }
    if (name === 'clink') { this.tone(3200, 0.12, 'sine', 0.12); setTimeout(() => this.tone(4300, 0.1, 'sine', 0.09), 60); }
    else if (name === 'dog') { this.tone(420, 0.14, 'sawtooth', 0.12, 220); setTimeout(() => this.tone(380, 0.12, 'sawtooth', 0.1, 200), 190); }
    else if (name === 'horn') { this.tone(430, 0.28, 'square', 0.05); this.tone(540, 0.28, 'square', 0.05); }
    else if (name === 'bike') { this.tone(120, 0.5, 'sawtooth', 0.04, 160); }
    else if (name === 'cheer') { this.tone(600, 0.15, 'triangle', 0.1, 900); }
  }

  // ---- giọng nói: file voice/<key>*.mp3, thiếu thì dùng giọng máy ----
  say({ role = 'staff', text = '', keys = [] }) {
    for (const k of keys.filter(Boolean)) {
      const f = this.files('voice', k);
      if (f.length) return this.play(rand(f), this.vol.voice * this.vol.master);
    }
    if (!this.ttsOn || !('speechSynthesis' in window) || !this.started) return null;
    if (speechSynthesis.pending && speechSynthesis.speaking) return null; // đang bận thì bỏ, tránh dồn hàng đợi
    const u = new SpeechSynthesisUtterance(text.replace(/[!]/g, ''));
    u.lang = 'vi-VN'; const v = this.currentVoice(); if (v) u.voice = v;
    // giữ tốc độ ~1 và cao độ gần 1 cho dễ nghe; chỉ lệch nhẹ để phân biệt vai
    const P = { guest: [1.0, 1.0], staff: [1.08, 1.0], owner: [0.85, 0.95], hangrong: [0.95, 1.0], xeom: [0.8, 1.0] }[role] || [1, 1];
    u.pitch = P[0]; u.rate = P[1]; u.volume = Math.min(1, this.vol.voice * this.vol.master);
    speechSynthesis.speak(u); return u;
  }

  // ---- chọn giọng đọc: mặc định giọng nam Microsoft NamMinh (Online Natural), có thể đổi trong bảng điều khiển ----
  currentVoice() {
    const list = this.voices; if (!list.length) return null;
    let want = null; try { want = localStorage.getItem('qn_voice'); } catch { /* bỏ qua */ }
    return list.find((v) => v.name === want)
      || list.find((v) => /nam\s*minh/i.test(v.name))
      || list.find((v) => !/hoai\s*my|an\b/i.test(v.name) && /\b(nam|male)\b/i.test(v.name))
      || list[0];
  }
  setVoice(name) { try { localStorage.setItem('qn_voice', name); } catch { /* bỏ qua */ } }
  testVoice(text = 'Một bia em ơi! Bàn số bảy, bia lạnh tới rồi anh em ơi!') {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'vi-VN'; const v = this.currentVoice(); if (v) u.voice = v;
    u.volume = Math.min(1, this.vol.voice * this.vol.master); speechSynthesis.speak(u);
  }
}
