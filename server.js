'use strict';
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 8787;
const ROOT = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data');
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', ico: 'image/x-icon', webp: 'image/webp', woff2: 'font/woff2' };

const rooms = new Map();
const reg = new Map();
let saveTimer = null;

function genCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return rooms.has(s) ? genCode() : s;
}
function now() { return Date.now(); }
function makeRoom(game) {
  const code = genCode();
  const r = { code, game, P: [null, null], state: null, ver: 0, created: now(), touched: now(), finished: false };
  rooms.set(code, r);
  return r;
}
function deliver(r, side, msg) {
  const p = r.P[side];
  if (p && p.conn) { try { p.conn.send(JSON.stringify(msg)); } catch (e) { dropConn(r, side); } }
}
function peerInfo(r, side) {
  const p = r.P[1 - side];
  return p ? { name: p.name, online: !!p.conn, side: 1 - side } : null;
}
function notifyPeer(r, side) {
  deliver(r, side, { t: 'peer', opponent: peerInfo(r, side) });
}
function dropConn(r, side) {
  const p = r.P[side];
  if (p && p.conn) {
    const c = p.conn;
    p.conn = null;
    try { c.close(); } catch (e) {}
    r.touched = now();
    notifyPeer(r, 1 - side);
    scheduleSave();
  }
}
function attach(channel, qp) {
  const pid = String(qp.pid || '');
  const name = String(qp.name || '玩家').slice(0, 12);
  const game = String(qp.game || '');
  const code = String(qp.code || '').toUpperCase();
  const create = qp.create === '1' || qp.create === 'true';
  if (!pid) return channel.send(JSON.stringify({ t: 'err', msg: '缺少身份参数' }));
  let r, side;
  if (create) {
    r = makeRoom(game);
    side = 0;
  } else if (code) {
    r = rooms.get(code);
    if (!r) return channel.send(JSON.stringify({ t: 'err', msg: '房间不存在或已解散（' + code + '）' }));
    if (game && game !== '?' && r.game !== game && r.game !== 'pending') return channel.send(JSON.stringify({ t: 'err', msg: '房间游戏类型不符' }));
    if (r.P[0] && r.P[0].pid === pid) side = 0;
    else if (r.P[1] && r.P[1].pid === pid) side = 1;
    else if (!r.P[0]) { side = 0; }
    else if (!r.P[1]) { side = 1; }
    else return channel.send(JSON.stringify({ t: 'err', msg: '房间已满' }));
  } else {
    const known = reg.get(pid);
    if (known && rooms.has(known.code)) {
      r = rooms.get(known.code);
      side = known.side;
      const p = r.P[side];
      if (p && p.pid !== pid) return channel.send(JSON.stringify({ t: 'err', msg: '座位已被占用' }));
    } else return channel.send(JSON.stringify({ t: 'err', msg: '未找到对局' }));
  }
  const prev = r.P[side];
  r.P[side] = { pid, name, conn: channel, last: now() };
  reg.set(pid, { code: r.code, side });
  if (r.game === 'pending' && game && game !== '?') r.game = game;
  channel.onClose = () => dropConn(r, side);
  const first = !prev;
  deliver(r, side, { t: 'welcome', code: r.code, side, game: r.game, opponent: peerInfo(r, side), state: r.state, ver: r.ver, resumed: !!prev });
  if (!first) notifyPeer(r, 1 - side);
  else deliver(r, 1 - side, { t: 'peer', opponent: peerInfo(r, 1 - side) });
  r.touched = now();
  scheduleSave();
}
function handleMessage(pid, payload) {
  const known = reg.get(pid);
  let msg;
  try { msg = typeof payload === 'string' ? JSON.parse(payload) : payload; } catch (e) { return { ok: false, msg: 'bad json' }; }
  const type = msg.t;
  if (type === 'ping') {
    if (known && rooms.has(known.code)) {
      const p = rooms.get(known.code).P[known.side];
      if (p && p.pid === pid) p.last = now();
    }
    return { ok: true };
  }
  if (!known) return { ok: false, msg: '未加入房间' };
  const r = rooms.get(known.code);
  if (!r) return { ok: false, msg: '房间已解散' };
  const side = known.side;
  const p = r.P[side];
  if (!p || p.pid !== pid) return { ok: false, msg: '座位校验失败' };
  p.last = now();
  if (type === 'g') {
    if (msg.snap) {
      if (!r.state || typeof r.state !== 'object' || !('s0' in r.state)) r.state = { s0: null, s1: null };
      r.state['s' + side] = msg.snap;
      r.ver++;
    }
    r.touched = now();
    deliver(r, 1 - side, { t: 'g', k: msg.k, d: msg.d, from: side, snap: !!msg.snap });
    scheduleSave();
    return { ok: true };
  }
  if (type === 'chat') {
    deliver(r, 1 - side, { t: 'chat', e: String(msg.e).slice(0, 8), from: side });
    return { ok: true };
  }
  if (type === 'leave') {
    deliver(r, 1 - side, { t: 'bye' });
    r.P[0] = null; r.P[1] = null;
    rooms.delete(r.code);
    scheduleSave();
    return { ok: true };
  }
  if (type === 'state') {
    if (!r.state || typeof r.state !== 'object' || !('s0' in r.state)) r.state = { s0: null, s1: null };
    r.state['s' + side] = msg.state;
    r.ver++;
    r.touched = now();
    scheduleSave();
    return { ok: true };
  }
  return { ok: false, msg: 'unknown type' };
}
function persistNow() {
  try {
    if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
    const out = [];
    for (const r of rooms.values()) {
      out.push({
        code: r.code, game: r.game, state: r.state, ver: r.ver, created: r.created, touched: r.touched,
        P: r.P.map(p => p ? { pid: p.pid, name: p.name, last: p.last } : null)
      });
    }
    fs.writeFileSync(path.join(DATA, 'rooms.json'), JSON.stringify(out));
  } catch (e) {}
}
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; persistNow(); }, 1500);
}
function loadPersisted() {
  try {
    const f = path.join(DATA, 'rooms.json');
    if (!fs.existsSync(f)) return;
    const arr = JSON.parse(fs.readFileSync(f, 'utf8'));
    const cutoff = now() - 30 * 60 * 1000;
    for (const o of arr) {
      if (o.touched < cutoff) continue;
      rooms.set(o.code, { code: o.code, game: o.game, P: o.P.map(p => p ? { pid: p.pid, name: p.name, conn: null, last: p.last } : null), state: o.state, ver: o.ver, created: o.created, touched: o.touched });
    }
    console.log('[duel] restored rooms:', rooms.size);
  } catch (e) {}
}
setInterval(() => {
  const cutoff = now() - 15000;
  for (const [code, r] of rooms) {
    for (const side of [0, 1]) {
      const p = r.P[side];
      if (p && p.conn && p.last < cutoff) {
        console.log('[duel] heartbeat timeout:', code, 'side', side);
        dropConn(r, side);
      }
    }
  }
}, 8000);
setInterval(() => {
  const cutoff = now() - 20 * 60 * 1000;
  let dirty = false;
  for (const [code, r] of rooms) {
    if (r.touched < cutoff) { rooms.delete(code); dirty = true; for (const [pid, k] of reg) if (k.code === code) reg.delete(pid); }
  }
  if (dirty) { scheduleSave(); console.log('[duel] cleanup, rooms:', rooms.size); }
}, 30000);

function wsSendFrame(sock, str) {
  const b = Buffer.from(str), l = b.length;
  let h;
  if (l < 126) { h = Buffer.alloc(2); h[0] = 0x81; h[1] = l; }
  else if (l < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(l, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(l), 2); }
  sock.write(Buffer.concat([h, b]));
}
function wsPong(sock) { sock.write(Buffer.from([0x8a, 0])); }
function wsPing(sock) { sock.write(Buffer.from([0x89, 0])); }
function wsClose(sock) { try { sock.write(Buffer.from([0x88, 0])); } catch (e) {} sock.end(); }

function acceptWS(req, sock, qp) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.end(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  let buf = Buffer.alloc(0);
  let frag = null;
  const conn = {
    type: 'ws',
    send: s => { if (!sock.destroyed) wsSendFrame(sock, s); },
    close: () => wsClose(sock)
  };
  sock.on('data', d => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) break;
      const b0 = buf[0], b1 = buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, o = 2;
      if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); o = 4; }
      else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); o = 10; }
      let mask = null;
      if (masked) { if (buf.length < o + 4) break; mask = buf.slice(o, o + 4); o += 4; }
      if (buf.length < o + len) break;
      let pl = buf.slice(o, o + len);
      if (mask && pl.length) { pl = Buffer.from(pl); for (let i = 0; i < pl.length; i++) pl[i] ^= mask[i & 3]; }
      buf = buf.slice(o + len);
      if (op === 9) { wsPong(sock); continue; }
      if (op === 8) { wsClose(sock); if (conn.onClose) conn.onClose(); return; }
      if (op === 10) continue;
      if (op === 1 || op === 2 || op === 0) {
        if (fin && op !== 0 && !frag) {
          const handler = conn.onMessage;
          if (handler) handler(pl.toString('utf8'));
        } else {
          frag = frag ? Buffer.concat([frag, pl]) : pl;
          if (fin) { const handler = conn.onMessage; if (handler) handler(frag.toString('utf8')); frag = null; }
        }
      }
    }
  });
  sock.on('error', () => {});
  sock.on('close', () => { if (conn.onClose) conn.onClose(); });
  conn.onMessage = s => handleMessage(qp.pid, s);
  attach(conn, qp);
  const ka = setInterval(() => { if (sock.destroyed) { clearInterval(ka); return; } wsPing(sock); }, 15000);
  sock.on('close', () => clearInterval(ka));
}
function sseAttach(req, res, qp) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  });
  res.write(': ok\n\n');
  let closed = false;
  const conn = {
    type: 'sse',
    send: s => { if (!closed) { try { res.write('data: ' + s + '\n\n'); } catch (e) {} } },
    close: () => { try { res.end(); } catch (e) {} }
  };
  const doClose = () => { if (closed) return; closed = true; if (conn.onClose) conn.onClose(); };
  res.on('close', doClose);
  req.on('close', doClose);
  req.on('error', doClose);
  req.on('aborted', doClose);
  try { req.socket.setNoDelay(true); } catch (e) {}
  req.socket.on('end', doClose);
  req.socket.on('error', doClose);
  conn.onClose = () => {};
  attach(conn, qp);
  const ka = setInterval(() => { if (closed) { clearInterval(ka); return; } try { res.write(': ka\n\n'); } catch (e) {} }, 15000);
}
function readBody(req, cb) {
  let chunks = [], size = 0;
  req.on('data', c => { size += c.length; if (size < 1e6) chunks.push(c); });
  req.on('end', () => { try { cb(null, Buffer.concat(chunks).toString('utf8')); } catch (e) { cb(e); } });
  req.on('error', e => cb(e));
}
function serveStatic(req, res, urlPath) {
  let p = urlPath.split('?')[0].split('#')[0];
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return; }
    const ext = path.extname(file).slice(1).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (p === '/api/send' && req.method === 'POST') {
    readBody(req, (e, body) => {
      if (e) { res.writeHead(400, cors); res.end('{}'); return; }
      try {
        const { pid, payload } = JSON.parse(body);
        const r = handleMessage(pid, payload);
        res.writeHead(200, cors); res.end(JSON.stringify(r));
      } catch (err) { res.writeHead(400, cors); res.end('{}'); }
    });
    return;
  }
  if (p === '/api/lookup' && req.method === 'POST') {
    readBody(req, (e, body) => {
      try {
        const { code } = JSON.parse(body);
        const r = rooms.get(String(code || '').toUpperCase());
        res.writeHead(200, cors);
        if (r) res.end(JSON.stringify({ ok: true, game: r.game, full: !!r.P[1], code: r.code }));
        else res.end(JSON.stringify({ ok: false, msg: '房间不存在或已过期' }));
      } catch (err) { res.writeHead(400, cors); res.end('{}'); }
    });
    return;
  }
  if (p === '/api/stream') { sseAttach(req, res, Object.fromEntries(u.searchParams)); return; }
  serveStatic(req, res, p);
});
server.on('upgrade', (req, sock) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname !== '/ws') { sock.end(); return; }
  const qp = Object.fromEntries(u.searchParams);
  if (!qp.pid) { sock.end(); return; }
  acceptWS(req, sock, qp);
});
loadPersisted();
server.listen(PORT, () => console.log('[duel] server on :' + PORT));
