'use strict';
const Net = (() => {
  let ws = null, es = null, mode = null;
  let helloParams = null;
  let hbTimer = null, retryTimer = null;
  let retryDelay = 400, dead = false, everUp = false;
  const handlers = {};

  function emit(type, data) { if (handlers[type]) handlers[type].forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }
  function on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); }

  function startHeartbeat() {
    clearInterval(hbTimer);
    hbTimer = setInterval(() => {
      sendRaw(JSON.stringify({ t: 'ping' }));
    }, 5000);
  }
  function stopHeartbeat() { clearInterval(hbTimer); hbTimer = null; }

  function sendRaw(str) {
    try {
      if (mode === 'ws' && ws && ws.readyState === 1) { ws.send(str); return true; }
    } catch (e) {}
    return false;
  }
  async function post(payload) {
    try {
      const r = await fetch('/api/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: helloParams.pid, payload })
      });
      return await r.json();
    } catch (e) { return { ok: false, msg: 'offline' }; }
  }

  function cleanup() {
    stopHeartbeat();
    if (ws) { try { ws.onclose = null; ws.onmessage = null; ws.onerror = null; ws.close(); } catch (e) {} ws = null; }
    if (es) { try { es.close(); } catch (e) {} es = null; }
    mode = null;
  }

  function handlePayload(raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    switch (m.t) {
      case 'welcome':
        retryDelay = 400;
        if (!everUp) { everUp = true; }
        emit('welcome', m);
        break;
      case 'g': emit('g', m); break;
      case 'chat': emit('chat', m); break;
      case 'peer': emit('peer', m.opponent); break;
      case 'bye': emit('bye'); break;
      case 'err': emit('err', m); break;
    }
  }

  function tryWS() {
    return new Promise(resolve => {
      let settled = false;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      let sock;
      try { sock = new WebSocket(proto + '//' + location.host + '/ws?' + helloParams.qs); }
      catch (e) { resolve(false); return; }
      const to = setTimeout(() => { if (!settled) { settled = true; try { sock.close(); } catch (e) {} resolve(false); } }, 4000);
      sock.onopen = () => {
        if (settled) { try { sock.close(); } catch (e) {} return; }
        settled = true; clearTimeout(to);
        ws = sock; mode = 'ws';
        sock.onmessage = ev => handlePayload(ev.data);
        sock.onclose = () => { ws = null; onDown(); };
        sock.onerror = () => {};
        resolve(true);
      };
      sock.onerror = () => { if (!settled) { settled = true; clearTimeout(to); resolve(false); } };
      sock.onclose = () => { if (!settled) { settled = true; clearTimeout(to); resolve(false); } };
    });
  }

  function trySSE() {
    return new Promise(resolve => {
      let settled = false;
      let sock;
      try { sock = new EventSource('/api/stream?' + helloParams.qs); }
      catch (e) { resolve(false); return; }
      const to = setTimeout(() => { if (!settled) { settled = true; try { sock.close(); } catch (e) {} resolve(false); } }, 5000);
      sock.onopen = () => {
        if (settled) return;
        settled = true; clearTimeout(to);
        es = sock; mode = 'sse';
        resolve(true);
      };
      sock.onmessage = ev => handlePayload(ev.data);
      sock.onerror = () => {
        if (!settled) { settled = true; clearTimeout(to); try { sock.close(); } catch (e) {} resolve(false); return; }
        es = null; mode = null;
        onDown();
      };
    });
  }

  function onDown() {
    if (dead) return;
    stopHeartbeat();
    emit('down');
    scheduleRetry();
  }
  function scheduleRetry() {
    if (retryTimer || dead) return;
    retryTimer = setTimeout(async () => {
      retryTimer = null;
      if (dead) return;
      const ok = mode === null ? (await tryWS()) || (await trySSE()) : mode === 'ws' ? await tryWS() : await trySSE();
      if (ok) {
        retryDelay = 400;
        startHeartbeat();
        emit('up', { resumed: true });
      } else {
        retryDelay = Math.min(retryDelay * 1.6, 6000);
        scheduleRetry();
      }
    }, retryDelay);
  }

  async function connect(params) {
    const qs = new URLSearchParams(params).toString();
    helloParams = { pid: params.pid, qs };
    dead = false;
    let ok = await tryWS();
    if (!ok) ok = await trySSE();
    if (!ok) {
      onDown();
      return false;
    }
    startHeartbeat();
    return true;
  }

  return {
    connect,
    on,
    async send(k, d, snap) {
      const payload = { t: 'g', k, d };
      if (snap) payload.snap = snap;
      if (mode === 'ws') return sendRaw(JSON.stringify(payload));
      return post(payload);
    },
    async chat(e) {
      const payload = { t: 'chat', e };
      if (mode === 'ws') return sendRaw(JSON.stringify(payload));
      return post(payload);
    },
    async leave() {
      dead = true;
      const payload = { t: 'leave' };
      if (mode === 'ws') sendRaw(JSON.stringify(payload)); else await post(payload);
      cleanup();
    },
    status() { return mode ? mode : 'off'; }
  };
})();
