'use strict';
const Sfx = (() => {
  let ac = null;
  function ctx() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return ac; }
  function tone(f, t0, dur, type, vol, slide) {
    const a = ctx(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, a.currentTime + t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, a.currentTime + t0 + dur);
    g.gain.setValueAtTime(0, a.currentTime + t0);
    g.gain.linearRampToValueAtTime(vol || .18, a.currentTime + t0 + .012);
    g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + dur + .05);
  }
  const lib = {
    click: () => tone(660, 0, .06, 'sine', .1),
    place: () => { tone(520, 0, .07, 'sine', .16); tone(780, .03, .09, 'triangle', .1); },
    pop: () => tone(420, 0, .1, 'triangle', .14, 880),
    good: () => { tone(620, 0, .09, 'sine', .14); tone(830, .08, .12, 'sine', .13); },
    bad: () => tone(220, 0, .22, 'sawtooth', .08, 130),
    win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .11, .3, 'triangle', .16)); },
    lose: () => { [392, 330, 262].forEach((f, i) => tone(f, i * .13, .3, 'sine', .13)); },
    tick: () => tone(880, 0, .04, 'sine', .07)
  };
  return { play(name) { try { if (lib[name]) lib[name](); } catch (e) {} } };
})();

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const GameKit = (() => {
  const qs = new URLSearchParams(location.search);
  const gid = qs.get('g') || '';
  const mode = qs.get('mode') || 'create';
  const codeParam = (qs.get('code') || '').toUpperCase();
  const LS_ID = 'duel_identity';
  function identity() {
    let v;
    try { v = JSON.parse(localStorage.getItem(LS_ID)); } catch (e) {}
    if (!v || !v.pid) {
      v = { pid: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name: '' };
      localStorage.setItem(LS_ID, JSON.stringify(v));
    }
    if (!v.name) v.name = '玩家' + v.pid.slice(-4).toUpperCase();
    return v;
  }
  const me = identity();

  const S = { def: null, ctx: null, side: 0, code: '', seed: 1, opp: { name: '对手', online: false }, state: null, myRematch: false, oppRematch: false, finished: false, online: false, waiting: false, handle: null, turn: null };

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const $ = s => document.querySelector(s);

  function buildShell(def) {
    document.body.innerHTML = '';
    const aurora = el('div', 'bg-aurora'); document.body.appendChild(aurora);
    const app = el('div', 'gk-app');
    app.innerHTML = `
      <header class="gk-top">
        <div class="logo" id="gkHome" title="返回大厅">⚡</div>
        <div><div class="gk-title">${def.name}</div><div class="gk-sub" id="gkSub">双人对决</div></div>
        <div class="gk-spacer"></div>
        <div class="gk-pill" id="gkNet"><span class="dot"></span><span id="gkNetTxt">…</span></div>
        <div class="gk-emojibar" id="gkEmoji">
          <button data-e="👍">👍</button><button data-e="😂">😂</button><button data-e="😱">😱</button><button data-e="🔥">🔥</button>
        </div>
        <button class="gk-btn ghost" id="gkExit" style="padding:8px 14px;font-size:13px">退出</button>
      </header>
      <div class="gk-players" id="gkPlayers" style="margin-top:14px"></div>
      <div class="gk-card gk-stage" id="gkRoot"></div>
      <div class="gk-toast-wrap" id="gkToasts"></div>`;
    document.body.appendChild(app);
    $('#gkHome').onclick = () => { if (!confirmLeave()) return; location.href = '/'; };
    $('#gkExit').onclick = () => { if (!confirmLeave()) return; Net.leave(); location.href = '/'; };
    $('#gkEmoji').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      Sfx.play('pop');
      if (S.online) Net.chat(b.dataset.e);
      showBubble(0, b.dataset.e);
    };
    window.addEventListener('beforeunload', () => { if (S.online) { try { navigator.sendBeacon('/api/send', JSON.stringify({ pid: me.pid, payload: { t: 'leave' } })); } catch (e) {} } });
    renderPlayers();
    setNet('ok', '就绪');
  }
  function confirmLeave() {
    if (S.finished || !S.started || !S.online) return true;
    return confirm('对局进行中，确定要退出吗？');
  }
  function avatarColor(name) {
    const pal = ['#3478f6', '#ff9f0a', '#30b15c', '#7b5cff', '#ff375f', '#00c7be', '#ff6482', '#64a3ff'];
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
    return pal[Math.abs(h) % pal.length];
  }
  function renderPlayers() {
    const box = $('#gkPlayers'); if (!box) return;
    box.innerHTML = '';
    const mk = (name, tag, isMe, idx) => {
      const d = el('div', 'gk-player' + (idx === 0 ? '' : ''));
      d.id = 'gkP' + idx;
      d.innerHTML = `<div class="gk-av" style="background:linear-gradient(135deg,${avatarColor(name)},${avatarColor(name)}cc)">${name.slice(0, 1).toUpperCase()}</div>
        <div class="gk-pinfo"><div class="gk-pname">${name}${isMe ? ' <span style="color:var(--ink3);font-weight:600;font-size:11px">(你)</span>' : ''}</div><div class="gk-pstat" id="gkPs${idx}">${tag}</div></div>`;
      return d;
    };
    box.appendChild(mk(me.name, '准备中', true, 0));
    const vs = el('div', 'gk-vs', 'VS'); box.appendChild(vs);
    box.appendChild(mk(S.opp.name, S.opp.online ? '已连接' : (mode === 'ai' ? 'AI 已就绪' : '等待加入'), false, 1));
  }
  function setNet(cls, txt) { const p = $('#gkNet'); if (!p) return; p.className = 'gk-pill ' + cls; $('#gkNetTxt').textContent = txt; }
  function setPlayerStat(idx, txt, online) {
    const e = $('#gkPs' + idx); if (e) e.textContent = txt;
    const p = $('#gkP' + idx); if (p) p.classList.toggle('offline', online === false);
  }
  function setTurn(idx) {
    const a = $('#gkP0'), b = $('#gkP1');
    if (a) a.classList.toggle('turn', idx === 0);
    if (b) b.classList.toggle('turn', idx === 1);
  }
  function toast(t) {
    const w = $('#gkToasts'); if (!w) return;
    const d = el('div', 'gk-toast', t); w.appendChild(d);
    setTimeout(() => { d.style.transition = 'opacity .4s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 400); }, 2200);
  }
  function showBubble(idx, e) {
    const p = $('#gkP' + idx); if (!p) return;
    const old = p.querySelector('.gk-bubble'); if (old) old.remove();
    const b = el('div', 'gk-bubble', e); p.appendChild(b);
    setTimeout(() => { b.style.transition = 'opacity .5s, transform .5s'; b.style.opacity = '0'; b.style.transform = 'translateY(-8px)'; setTimeout(() => b.remove(), 500); }, 2000);
  }
  function confetti() {
    let cv = document.getElementById('confetti-cv');
    if (!cv) { cv = el('canvas'); cv.id = 'confetti-cv'; document.body.appendChild(cv); }
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const cols = ['#3478f6', '#7b5cff', '#30b15c', '#ff9f0a', '#ff375f', '#00c7be'];
    const ps = Array.from({ length: 130 }, () => ({
      x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * .5,
      w: 6 + Math.random() * 7, h: 9 + Math.random() * 8,
      vy: 2.4 + Math.random() * 3.4, vx: -1.4 + Math.random() * 2.8,
      rot: Math.random() * Math.PI, vr: -.14 + Math.random() * .28, col: cols[Math.random() * cols.length | 0]
    }));
    const t0 = performance.now();
    (function frame(t) {
      c.clearRect(0, 0, innerWidth, innerHeight);
      const dt = t - t0;
      for (const p of ps) {
        p.y += p.vy; p.x += p.vx + Math.sin((t + p.rot * 100) / 400) * .7; p.rot += p.vr;
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = p.col; c.globalAlpha = Math.max(0, 1 - dt / 3200);
        c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c.restore();
      }
      if (dt < 3300) requestAnimationFrame(frame); else c.clearRect(0, 0, innerWidth, innerHeight);
    })(t0);
  }

  function finish(result, detail) {
    if (S.finished) return;
    S.finished = true;
    setTurn(-1);
    const win = result === 'win';
    if (win) { Sfx.play('win'); confetti(); } else if (result === 'lose') Sfx.play('lose'); else Sfx.play('good');
    const emoji = win ? '🏆' : result === 'draw' ? '🤝' : '💪';
    const title = win ? '胜利！' : result === 'draw' ? '平局' : '惜败';
    const desc = detail || (win ? '漂亮的对局，你技高一筹！' : result === 'draw' ? '势均力敌，不分伯仲。' : '胜败乃兵家常事，再战一局？');
    const mask = el('div', 'gk-modal-mask');
    mask.innerHTML = `<div class="gk-modal">
      <div class="m-emoji">${emoji}</div>
      <div class="m-title">${title}</div>
      <div class="m-desc">${desc}</div>
      <div class="m-actions">
        ${S.online ? '<button class="gk-btn" id="gkRematch">🔁 再来一局</button>' : '<button class="gk-btn" id="gkRematch">🔁 再来一局</button>'}
        <button class="gk-btn ghost" id="gkBack">返回大厅</button>
      </div></div>`;
    document.body.appendChild(mask);
    mask.querySelector('#gkBack').onclick = () => { Net.leave(); location.href = '/'; };
    mask.querySelector('#gkRematch').onclick = () => rematch();
  }

  function rematch() {
    Sfx.play('click');
    if (!S.online) { restartGame(String(Date.now())); return; }
    if (S.side === 0) {
      S.myRematch = true;
      if (S.oppRematch) { const s = String(Date.now()) + Math.random(); Net.send('sys', { restart: 1, seed: s }); restartGame(s); }
      else toast('等待对手同意…');
    } else {
      S.myRematch = true;
      Net.send('sys', { rematch: 1 });
      toast('已请求再来一局…');
    }
    const btn = document.getElementById('gkRematch'); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
  }

  function restartGame(seed) {
    S.seed = seed;
    S.finished = false; S.myRematch = false; S.oppRematch = false;
    const mask = document.querySelector('.gk-modal-mask'); if (mask) mask.remove();
    if (S.handle && S.handle.destroy) try { S.handle.destroy(); } catch (e) {}
    $('#gkRoot').innerHTML = '';
    Sfx.play('pop');
    startGame();
  }

  function showInvite() {
    const root = $('#gkRoot');
    if (document.getElementById('gkInvite')) return;
    S.waiting = true;
    setNet('warn', '等待对手');
    const chars = S.code.split('');
    const ov = el('div', 'gk-invite-mask');
    ov.id = 'gkInvite';
    ov.innerHTML = `<div class="gk-invite">
      <div style="font-size:44px">🎮</div>
      <div style="font-size:20px;font-weight:800;margin-top:12px">把房间码发给好友</div>
      <div class="tip">好友在「对决竞技场」输入房间码即可加入<br>或直接把邀请链接发给对方</div>
      <div class="gk-code-row">${chars.map((c, i) => `<div class="gk-code-ch" style="animation-delay:${i * 70}ms">${c}</div>`).join('')}</div>
      <div class="actions">
        <button class="gk-btn" id="gkCopy">📋 复制邀请链接</button>
        <button class="gk-btn ghost" id="gkBack2">返回大厅</button>
      </div>
      <div class="tip" style="margin-top:18px;display:flex;align-items:center;gap:8px;justify-content:center"><span class="spin"></span> 等待对手加入，房间将保留 20 分钟…</div>
    </div>`;
    root.appendChild(ov);
    ov.querySelector('#gkCopy').onclick = () => {
      const url = location.origin + '/?g=' + gid + '&code=' + S.code;
      navigator.clipboard.writeText(url).then(() => toast('链接已复制，发给好友吧')).catch(() => prompt('复制以下链接', url));
      Sfx.play('click');
    };
    ov.querySelector('#gkBack2').onclick = () => { Net.leave(); location.href = '/'; };
  }

  function startGame() {
    S.waiting = false;
    const ctx = makeCtx();
    setNet('ok', S.online ? '联机中' : '单机·AI');
    setPlayerStat(0, '执先', true);
    setPlayerStat(1, S.online ? (S.opp.online ? '已连接' : '重连中…') : (mode === 'ai' ? 'AI 已就绪' : '对手'), S.online ? S.opp.online : true);
    setTurn(S.side === 0 ? 0 : 1);
    S.handle = S.def.create(ctx);
  }

  function makeCtx() {
    const rng = mulberry32(hashSeed(String(S.seed)));
    return {
      mode: S.online ? 'online' : 'ai',
      side: S.side,
      seed: S.seed,
      rng,
      root: $('#gkRoot'),
      me: { name: me.name },
      opp: { name: S.online ? S.opp.name : 'AI 对手' },
      setStatus(t) { setPlayerStat(S.side === 0 ? 0 : 0, t); },
      setOppStatus(t) { setPlayerStat(1, t); },
      turn(idx) { setTurn(idx); },
      send(k, d, snap) { if (S.online) Net.send(k, d, snap); },
      toast(t) { toast(t); },
      sfx: Sfx,
      finish(r, d) { if (!S.online || S.side === 0 || r !== 'win') finish(r, d); else finish(r, d); },
      onMsg(cb) { S.msgCb = cb; },
      onRestore(cb) { S.restoreCb = cb; },
      onPeer(cb) { S.peerCb = cb; }
    };
  }

  function handleG(m) {
    const { k, d } = m;
    if (k === 'sys') {
      if (d.rematch) {
        S.oppRematch = true;
        Sfx.play('pop');
        if (S.side === 0 && S.myRematch) { const s = String(Date.now()) + Math.random(); Net.send('sys', { restart: 1, seed: s }); restartGame(s); }
        else if (!S.finished) toast('对手想再来一局！');
        else if (S.side === 0) { const s = String(Date.now()) + Math.random(); Net.send('sys', { restart: 1, seed: s }); restartGame(s); }
        else toast('对手想再来一局，点击「再来一局」开始');
        const btn = document.getElementById('gkRematch');
        if (btn && btn.disabled) { btn.disabled = false; btn.textContent = '🔁 接受再来一局'; }
      } else if (d.restart) {
        restartGame(d.seed);
      }
      return;
    }
    if (S.msgCb) S.msgCb(k, d);
  }

  async function boot(def) {
    if (typeof GAMES !== 'undefined') {
      const meta = GAMES.find(g => g.id === gid);
      if (meta) def = Object.assign({}, meta, def);
    }
    S.def = def;
    buildShell(def);
    document.title = (def.name || gid) + ' · 双人对决';
    if (mode === 'ai') {
      S.online = false;
      S.seed = String(Date.now());
      startGame();
      return;
    }
    S.online = true;
    setNet('warn', '连接中…');
    Net.on('welcome', w => {
      S.code = w.code; S.side = w.side; S.ver = w.ver;
      S.seed = hashSeed(w.code + ':' + (w.ver || 0));
      if (w.opponent) { S.opp = { name: w.opponent.name || '对手', online: w.opponent.online }; }
      renderPlayers();
      const resumed = w.resumed && w.state;
      if (S.started) {
        if (resumed && S.restoreCb) { S.restoreCb(w.state); toast('已恢复对局'); }
        return;
      }
      if (w.side === 0 && !w.opponent) {
        S.started = true;
        startGame();
        showInvite();
      } else {
        S.started = true;
        startGame();
        if (resumed && S.restoreCb) { S.restoreCb(w.state); toast('已恢复上次对局'); }
      }
      if (w.side === 1) { $('#gkSub').textContent = '房间 ' + w.code; }
    });
    Net.on('g', handleG);
    Net.on('chat', m => { showBubble(1, m.e); Sfx.play('pop'); });
    Net.on('peer', op => {
      const wasOnline = S.opp.online;
      S.opp = { name: op.name || S.opp.name, online: op.online };
      setPlayerStat(1, op.online ? '已连接' : '离线', op.online);
      if (S.waiting && op.online) {
        S.waiting = false;
        const inv = document.getElementById('gkInvite'); if (inv) inv.remove();
        toast(op.name + ' 加入了房间！');
        Sfx.play('good');
      }
      if (!S.waiting) {
        if (op.online && !wasOnline) toast('对手已重新连接');
        if (!op.online && wasOnline) { toast('对手断线，等待重连…'); Sfx.play('bad'); }
      }
      if (S.started && S.peerCb) S.peerCb(op.online);
    });
    Net.on('bye', () => {
      Sfx.play('bad');
      if (S.finished) { toast('对手已离开'); return; }
      const mask = el('div', 'gk-modal-mask');
      mask.innerHTML = `<div class="gk-modal">
        <div class="m-emoji">🚪</div>
        <div class="m-title">对手已离开</div>
        <div class="m-desc">房间已解散，你可以判胜回大厅，或再开一局。</div>
        <div class="m-actions">
          <button class="gk-btn" id="gkW">🏆 判我获胜并返回</button>
          <button class="gk-btn ghost" id="gkB">返回大厅</button>
        </div></div>`;
      document.body.appendChild(mask);
      mask.querySelector('#gkW').onclick = () => location.href = '/';
      mask.querySelector('#gkB').onclick = () => location.href = '/';
    });
    Net.on('down', () => setNet('bad', '重连中…'));
    Net.on('up', () => { setNet(S.waiting ? 'warn' : 'ok', S.waiting ? '等待对手' : '已重连'); });
    Net.on('err', e => {
      toast(e.msg || '连接失败');
      setNet('bad', '连接失败');
      if (!S.started) {
        const root = $('#gkRoot');
        root.innerHTML = `<div class="gk-invite"><div style="font-size:44px">😵</div>
          <div style="font-size:19px;font-weight:800;margin-top:12px">${e.msg || '连接失败'}</div>
          <div class="actions"><button class="gk-btn" onclick="location.href='/'">返回大厅</button></div></div>`;
      }
    });
    const params = { pid: me.pid, name: me.name, game: gid };
    if (mode === 'join' && codeParam) params.code = codeParam;
    else if (codeParam) { params.code = codeParam; }
    else params.create = '1';
    const ok = await Net.connect(params);
    if (!ok) setNet('bad', '连接失败，将自动重试…');
  }

  return { boot, finish, toast, Sfx, identity, qs };
})();
