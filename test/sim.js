'use strict';
const http = require('http');
const BASE = 'http://127.0.0.1:8787';
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL: ' + name); } }

function post(path, body) {
  return new Promise((res, rej) => {
    const data = JSON.stringify(body || {});
    const req = http.request(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(b); } });
    });
    req.on('error', rej); req.write(data); req.end();
  });
}
function openStream(qs, onMsg) {
  return new Promise((res, rej) => {
    const req = http.request(BASE + '/api/stream?' + qs, { method: 'GET' }, r => {
      let buf = '';
      const state = { req, close: () => { try { req.socket.end(); } catch (e) {} try { req.destroy(); } catch (e) {} } };
      r.on('data', c => {
        if (process.env.RAW) console.log('  [raw' + (qs.match(/pid=(\w+)/) || [''])[1] + ']', JSON.stringify(c.toString().slice(0, 200)));
        buf += c.toString();
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const line = chunk.split('\n').find(l => l.startsWith('data: '));
          if (line) { const m = JSON.parse(line.slice(6)); onMsg(m, state); }
        }
      });
      r.on('error', () => {});
      res(state);
    });
    req.on('error', rej); req.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('== 1. 静态资源 ==');
  const get = p => new Promise(res => http.get(BASE + p, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ code: r.statusCode, body: b })); }));
  for (const p of ['/', '/game.html', '/design.css', '/net.js', '/sdk.js', '/registry.js', '/lobby.js', '/games/gomoku/main.js']) {
    const r = await get(p);
    ok(r.code === 200 && r.body.length > 10, 'GET ' + p);
  }

  console.log('== 2. 房间创建/加入/转发 ==');
  const hostMsgs = [], guestMsgs = [];
  const host = await openStream('pid=H1&name=Host&game=gomoku&create=1', m => hostMsgs.push(m));
  await sleep(200);
  const welcome = hostMsgs.find(m => m.t === 'welcome');
  ok(welcome && welcome.side === 0, 'host 创建房间 side=0');
  const code = welcome.code;
  ok(/^[A-Z2-9]{5}$/.test(code), '房间码格式 ' + code);

  const guest = await openStream('pid=G1&name=Guest&game=gomoku&code=' + code, m => guestMsgs.push(m));
  await sleep(250);
  const gWelcome = guestMsgs.find(m => m.t === 'welcome');
  ok(gWelcome && gWelcome.side === 1, 'guest 加入 side=1');
  const hPeer = hostMsgs.find(m => m.t === 'peer');
  ok(hPeer && hPeer.opponent && hPeer.opponent.online === true, 'host 收到 guest 上线通知');

  console.log('== 3. 走子转发 + 快照缓存 ==');
  await post('/api/send', { pid: 'H1', payload: { t: 'g', k: 'mv', d: { x: 7, y: 7 }, snap: { g: 'gomoku', f: [], t: 2 } } });
  await sleep(250);
  const got = guestMsgs.find(m => m.t === 'g' && m.k === 'mv');
  ok(got && got.d.x === 7 && got.from === 0, 'guest 收到走子转发');

  console.log('== 4. 断线重连（核心稳定性）==');
  host.close();
  await sleep(300);
  const gPeer = guestMsgs.filter(m => m.t === 'peer');
  console.log('  [dbg] guestMsgs:', JSON.stringify(guestMsgs));
  ok(gPeer.length && gPeer[gPeer.length - 1].opponent.online === false, 'guest 收到 host 离线通知');

  const host2Msgs = [];
  const host2 = await openStream('pid=H1&name=Host&game=gomoku&code=' + code, m => host2Msgs.push(m));
  await sleep(250);
  const w2 = host2Msgs.find(m => m.t === 'welcome');
  ok(w2 && w2.side === 0 && w2.resumed === true, 'host 凭 pid 恢复座位');
  ok(w2 && w2.state && w2.state.s0 && w2.state.s0.t === 2, '恢复时下发缓存的快照状态');
  const gPeer2 = guestMsgs.filter(m => m.t === 'peer');
  console.log('  [dbg] gPeer2:', JSON.stringify(gPeer2));
  ok(gPeer2.length >= 2 && gPeer2[gPeer2.length - 1].opponent.online === true, 'guest 收到 host 重连通知');

  console.log('== 5. 双方都断线 → 房间保留 ==');
  host2.close(); guest.close();
  await sleep(300);
  const h3Msgs = [];
  const h3 = await openStream('pid=H1&name=Host&game=gomoku&code=' + code, m => h3Msgs.push(m));
  const g3Msgs = [];
  const g3 = await openStream('pid=G1&name=Guest&game=gomoku&code=' + code, m => g3Msgs.push(m));
  await sleep(250);
  const w3 = h3Msgs.find(m => m.t === 'welcome');
  const w4 = g3Msgs.find(m => m.t === 'welcome');
  ok(w3 && w3.resumed, '双方重连成功（host）');
  console.log('  [dbg] w4:', JSON.stringify(w4));
  ok(w4 && w4.resumed && w4.state && w4.state.s0 && w4.state.s0.t === 2, '双方重连成功（guest 拿到状态）');

  console.log('== 6. lookup / leave ==');
  const lk = await post('/api/lookup', { code });
  ok(lk.ok && lk.game === 'gomoku', 'lookup 查询房间游戏类型');
  const lkBad = await post('/api/lookup', { code: 'ZZZZZ' });
  ok(!lkBad.ok, 'lookup 不存在房间报错');
  await post('/api/send', { pid: 'G1', payload: { t: 'leave' } });
  await sleep(200);
  const bye = h3Msgs.find(m => m.t === 'bye');
  ok(!!bye, 'leave 后对方收到 bye');
  const lk2 = await post('/api/lookup', { code });
  ok(!lk2.ok, 'leave 后房间解散');

  console.log('== 7. 房间已满 / 不存在 ==');
  const full = await openStream('pid=X9&name=X&game=gomoku&code=' + code, m => {});
  await sleep(200);
  const h4 = await openStream('pid=H2&name=H&game=gomoku&create=1', m => {});
  await sleep(150);
  const c4 = h4 ? null : null;
  const badJoin = [];
  const bj = await openStream('pid=Y9&name=Y&game=go9&code=' + code, m => badJoin.push(m));
  await sleep(200);
  ok(badJoin.some(m => m.t === 'err'), '加入不存在房间返回 err');

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试崩溃:', e); process.exit(2); });
