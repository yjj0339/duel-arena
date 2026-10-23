'use strict';
const http = require('http');
const BASE = 'http://127.0.0.1:8787';
function openStream(qs, tag) {
  return new Promise((res, rej) => {
    const req = http.request(BASE + '/api/stream?' + qs, { method: 'GET' }, r => {
      let buf = '';
      const st = { req, msgs: [] };
      r.on('data', c => {
        buf += c.toString();
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const line = chunk.split('\n').find(l => l.startsWith('data: '));
          if (line) {
            try { const m = JSON.parse(line.slice(6)); st.msgs.push(m); console.log('[' + tag + '] <- ' + JSON.stringify(m).slice(0, 130)); } catch (e) { console.log('[' + tag + '] parse err'); }
          }
        }
      });
      r.on('close', () => console.log('[' + tag + '] stream closed'));
      r.on('error', () => {});
      res(st);
    });
    req.on('error', rej); req.end();
  });
}
function post(path, body) {
  return new Promise((res, rej) => {
    const d = JSON.stringify(body);
    const req = http.request(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => res(b));
    });
    req.on('error', rej); req.write(d); req.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('--- T1 host 创建');
  const host = await openStream('pid=D1&name=D&game=gomoku&create=1', 'HOST');
  await sleep(800);
  const w = host.msgs.find(m => m.t === 'welcome');
  console.log('--- T2 guest 加入');
  const guest = await openStream('pid=D2&name=G&game=gomoku&code=' + w.code, 'GUEST');
  await sleep(800);
  console.log('--- T3 host 走子(带快照)');
  console.log('send resp:', await post('/api/send', { pid: 'D1', payload: { t: 'g', k: 'mv', d: { x: 5, y: 5 }, snap: { g: 'gomoku', f: [1, 0], t: 2 } } }));
  await sleep(800);
  console.log('--- T4 host 断开(SSE destroy)');
  host.req.destroy();
  await sleep(1200);
  console.log('--- T5 host 重连');
  const host2 = await openStream('pid=D1&name=D&game=gomoku&code=' + w.code, 'HOST2');
  await sleep(1000);
  const w2 = host2.msgs.find(m => m.t === 'welcome');
  console.log('>>> host2 resumed=', w2 && w2.resumed, 'state=', JSON.stringify(w2 && w2.state));
  console.log('>>> guest 全部消息类型:', guest.msgs.map(m => m.t + (m.opponent ? '(online=' + m.opponent.online + ')' : '')).join(', '));
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
