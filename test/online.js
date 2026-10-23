'use strict';
const http = require('http');
const https = require('https');
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const COOKIE = process.env.COOKIE || '';
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL: ' + name); } }

function openStream(qs, onMsg) {
  return new Promise((res, rej) => {
    const url = new URL(BASE + '/api/stream?' + qs);
    const mod = url.protocol === 'https:' ? https : http;
    const opts = { method: 'GET', headers: {} };
    if (COOKIE) opts.headers.Cookie = COOKIE;
    const req = mod.request(url, opts, r => {
      let buf = '';
      const state = { req, close: () => req.destroy(), msgs: [] };
      r.on('data', c => {
        buf += c.toString();
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const line = chunk.split('\n').find(l => l.startsWith('data: '));
          if (line) { try { const m = JSON.parse(line.slice(6)); state.msgs.push(m); if (onMsg) onMsg(m); } catch (e) {} }
        }
      });
      r.on('error', () => {});
      res(state);
    });
    req.on('error', rej);
    req.end();
  });
}
function post(path, body) {
  return new Promise((res, rej) => {
    const url = new URL(BASE + path);
    const mod = url.protocol === 'https:' ? https : http;
    const d = JSON.stringify(body || {});
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } };
    if (COOKIE) opts.headers.Cookie = COOKIE;
    const req = mod.request(url, opts, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res(b)); });
    req.on('error', rej); req.write(d); req.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('== 线上联机全流程 ==');
  const hostMsgs = [];
  const host = await openStream('pid=H1&name=主播&game=gomoku&create=1', m => hostMsgs.push(m));
  await sleep(2000);
  const w = hostMsgs.find(m => m.t === 'welcome');
  ok(w && w.side === 0, 'host 创建房间 side=0');
  if (!w) { console.log('无法继续'); process.exit(1); }
  const code = w.code;
  ok(/^[A-Z2-9]{5}$/.test(code), '房间码 ' + code);

  const guestMsgs = [];
  const guest = await openStream('pid=G1&name=观众&game=gomoku&code=' + code, m => guestMsgs.push(m));
  await sleep(2000);
  const gw = guestMsgs.find(m => m.t === 'welcome');
  ok(gw && gw.side === 1, 'guest 加入 side=1');
  ok(hostMsgs.some(m => m.t === 'peer' && m.opponent && m.opponent.online), 'host 收到 guest 上线通知');

  await post('/api/send', { pid: 'H1', payload: { t: 'g', k: 'mv', d: { x: 7, y: 7 }, snap: { g: 'gomoku', f: [1], t: 2 } } });
  await sleep(1800);
  ok(guestMsgs.some(m => m.t === 'g' && m.k === 'mv' && m.d && m.d.x === 7), 'guest 收到走子转发');

  console.log('  -- 断开双方，模拟退出 --');
  host.close(); guest.close();
  await sleep(1500);

  const h2Msgs = [];
  const host2 = await openStream('pid=H1&name=主播&game=gomoku&code=' + code, m => h2Msgs.push(m));
  await sleep(2000);
  const w2 = h2Msgs.find(m => m.t === 'welcome');
  ok(w2 && w2.resumed === true, 'host 凭 pid 重连恢复座位');
  ok(w2 && w2.state && w2.state.s0 && w2.state.s0.t === 2, '重连下发缓存快照（含对方状态）');

  const g2Msgs = [];
  const guest2 = await openStream('pid=G1&name=观众&game=gomoku&code=' + code, m => g2Msgs.push(m));
  await sleep(2000);
  const gw2 = g2Msgs.find(m => m.t === 'welcome');
  ok(gw2 && gw2.resumed === true && gw2.state && gw2.state.s0, 'guest 重连恢复');

  const lk = await post('/api/lookup', { code });
  ok(lk.includes('"ok":true'), 'lookup 查询房间');

  console.log('\n线上结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('崩溃:', e.message); process.exit(2); });
