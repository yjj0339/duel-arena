'use strict';
window.GameDef = (() => {
  let ctx = null;
  const S = { secret: '', myLog: [], oppLog: [], turn: 0, over: false, pending: false, input: '', winner: -1, lastMsg: null };
  let ui = {}, timers = [], aiCands = [], aiSecret = '';

  const css = document.createElement('style');
  css.textContent = `
  .bl-wrap{display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 0}
  .bl-secretrow{display:flex;align-items:center;gap:12px}
  .bl-cap{font-size:13px;font-weight:700;color:var(--ink2)}
  .bl-sbox{width:44px;height:52px;border-radius:12px;display:grid;place-items:center;font-size:22px;font-weight:800;color:#3478f6;background:linear-gradient(180deg,#ffffff,#f0f5ff);border:1px solid #d8e3fb;box-shadow:0 4px 10px rgba(52,120,246,.12),inset 0 1px 0 #fff}
  .bl-cols{display:flex;gap:10px;width:min(560px,92vw)}
  .bl-col{flex:1;min-width:0;background:rgba(255,255,255,.78);border:1px solid var(--line);border-radius:14px;padding:10px}
  .bl-chead{font-size:12px;font-weight:800;color:var(--ink3);margin-bottom:8px;text-align:center}
  .bl-list{max-height:168px;overflow-y:auto;display:flex;flex-direction:column;gap:6px}
  .bl-row{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-radius:10px;background:#f6f7fb;animation:blslide .4s var(--ease)}
  @keyframes blslide{from{opacity:0;transform:translateY(-8px)}}
  .bl-g{font-weight:800;font-size:15px;letter-spacing:3px;color:var(--ink)}
  .bl-fb i{font-style:normal;font-weight:800;font-size:12px}
  .bl-fb .a{color:#30b15c}
  .bl-fb .b{color:#ff9f0a;margin-left:8px}
  .bl-row.win4{background:linear-gradient(90deg,#e9fbf1,#dcf7e7);outline:1px solid rgba(48,177,92,.45)}
  .bl-empty{font-size:12px;color:var(--ink3);text-align:center;padding:10px 0}
  .bl-cells{display:flex;gap:10px;justify-content:center}
  .bl-cell{width:52px;height:60px;border-radius:14px;display:grid;place-items:center;font-size:26px;font-weight:800;color:#c6cbdb;background:linear-gradient(180deg,#fff,#f3f5fa);border:2px solid #e4e7f2;box-shadow:inset 0 2px 6px rgba(20,40,90,.05);transition:all .15s}
  .bl-cell.fill{border-color:#3478f6;color:#3478f6;box-shadow:0 4px 12px rgba(52,120,246,.18);transform:translateY(-2px)}
  .bl-pad{display:grid;grid-template-columns:repeat(3,72px);gap:9px;justify-content:center;transition:opacity .25s}
  .bl-pad.lock{opacity:.4;pointer-events:none}
  .bl-key{height:48px;border-radius:13px;border:1px solid var(--line);background:linear-gradient(180deg,#fff,#f3f5fa);font-size:19px;font-weight:800;color:var(--ink);cursor:pointer;box-shadow:0 3px 8px rgba(30,50,100,.08),inset 0 1px 0 #fff;transition:transform .12s}
  .bl-key:hover{transform:translateY(-2px)}
  .bl-key:active{transform:scale(.93)}
  .bl-key.ok{background:linear-gradient(180deg,#4c92ff,#2f6fe0);color:#fff;border:none}
  .bl-key.del{color:#ff375f}
  .bl-hint{font-size:13px;font-weight:600;color:var(--ink3);min-height:18px;text-align:center}
  `;
  document.head.appendChild(css);

  function meIdx() { return ctx.mode === 'ai' ? 0 : ctx.side; }
  function later(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); return t; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function randSecret() {
    const d = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d.slice(0, 4).join('');
  }
  function seedCands() {
    aiCands = [];
    for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) { if (b === a) continue; for (let c = 0; c < 10; c++) { if (c === a || c === b) continue; for (let e = 0; e < 10; e++) { if (e === a || e === b || e === c) continue; aiCands.push('' + a + b + c + e); } } }
  }
  function feedback(guess, secret) {
    let a = 0, b = 0;
    for (let i = 0; i < 4; i++) { if (guess[i] === secret[i]) a++; else if (secret.indexOf(guess[i]) >= 0) b++; }
    return [a, b];
  }
  function valid(g) { return /^\d{4}$/.test(g) && new Set(g).size === 4; }

  function buildUI() {
    ctx.root.innerHTML = '';
    const w = document.createElement('div');
    w.className = 'bl-wrap';
    w.innerHTML = `
      <div class="bl-secretrow">
        <span class="bl-cap">你的密码</span>
        <div class="bl-sbox" id="blS0"></div><div class="bl-sbox" id="blS1"></div><div class="bl-sbox" id="blS2"></div><div class="bl-sbox" id="blS3"></div>
      </div>
      <div class="bl-cols">
        <div class="bl-col"><div class="bl-chead">对方试探你的密码</div><div class="bl-list" id="blOpp"></div></div>
        <div class="bl-col"><div class="bl-chead">我的猜测记录</div><div class="bl-list" id="blMine"></div></div>
      </div>
      <div class="bl-cells"><div class="bl-cell"></div><div class="bl-cell"></div><div class="bl-cell"></div><div class="bl-cell"></div></div>
      <div class="bl-pad" id="blPad"></div>
      <div class="bl-hint" id="blHint"></div>`;
    ctx.root.appendChild(w);
    ui = {
      sboxes: [0, 1, 2, 3].map(i => w.querySelector('#blS' + i)),
      opp: w.querySelector('#blOpp'),
      mine: w.querySelector('#blMine'),
      cells: Array.from(w.querySelectorAll('.bl-cell')),
      pad: w.querySelector('#blPad'),
      hint: w.querySelector('#blHint')
    };
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'D', '0', 'S'];
    keys.forEach(k => {
      const b = document.createElement('button');
      b.className = 'bl-key' + (k === 'S' ? ' ok' : k === 'D' ? ' del' : '');
      b.textContent = k === 'D' ? '⌫' : k === 'S' ? '✓' : k;
      b.onclick = () => tap(k);
      ui.pad.appendChild(b);
    });
  }

  function logHTML(list) {
    if (!list.length) return '<div class="bl-empty">暂无记录</div>';
    return list.map(e => '<div class="bl-row' + (e[1] === 4 ? ' win4' : '') + '"><span class="bl-g">' + e[0] + '</span><span class="bl-fb"><i class="a">' + e[1] + 'A</i><i class="b">' + e[2] + 'B</i></span></div>').join('');
  }

  function renderAll() {
    for (let i = 0; i < 4; i++) ui.sboxes[i].textContent = S.secret[i];
    ui.opp.innerHTML = logHTML(S.oppLog);
    ui.mine.innerHTML = logHTML(S.myLog);
    for (let i = 0; i < 4; i++) {
      ui.cells[i].textContent = S.input[i] || '';
      ui.cells[i].classList.toggle('fill', !!S.input[i]);
    }
    ui.pad.classList.toggle('lock', S.over || S.turn !== meIdx() || S.pending);
    ui.hint.textContent = S.over ? '对局结束'
      : S.pending ? '等待对方反馈…'
      : S.turn === meIdx() ? '轮到你猜：输入 4 位不重复数字'
      : '对方猜测中…';
  }

  function afterChange() {
    renderAll();
    if (S.over) return;
    if (S.turn === meIdx()) {
      ctx.turn(0);
      ctx.setStatus('你的回合');
    } else {
      ctx.turn(1);
      ctx.setStatus('对方猜测中…');
      ctx.setOppStatus('思考中…');
      if (ctx.mode === 'ai') later(aiGuess, 800 + Math.random() * 600);
    }
  }

  function tap(k) {
    if (S.over || S.turn !== meIdx() || S.pending) return;
    if (k === 'S') { submit(); return; }
    ctx.sfx.play('tick');
    if (k === 'D') S.input = S.input.slice(0, -1);
    else if (S.input.length < 4) {
      if (S.input.indexOf(k) >= 0) { ctx.toast('数字已经用过了'); return; }
      S.input += k;
    }
    renderAll();
  }

  function submit() {
    if (S.over || S.turn !== meIdx() || S.pending) return;
    if (S.input.length !== 4) { ctx.toast('请输满 4 位数字'); ctx.sfx.play('bad'); return; }
    if (!valid(S.input)) { ctx.toast('数字不能重复'); ctx.sfx.play('bad'); return; }
    const g = S.input;
    S.pending = true;
    S.input = '';
    ctx.sfx.play('click');
    renderAll();
    ctx.setStatus('等待对方反馈…');
    if (ctx.mode === 'online') { S.lastMsg = { g: g }; ctx.send('mv', S.lastMsg, serialize()); }
    else later(() => onFeedback(g, feedback(g, aiSecret)), 500 + Math.random() * 500);
  }

  function onGuess(g) {
    if (S.over || S.turn === meIdx()) return;
    g = String(g);
    if (!valid(g) || S.oppLog.some(e => e[0] === g)) return;
    const f = feedback(g, S.secret);
    S.oppLog.unshift([g, f[0], f[1]]);
    S.turn = meIdx();
    ctx.sfx.play(f[0] === 4 ? 'bad' : 'pop');
    if (ctx.mode === 'online') { S.lastMsg = { fb: f, g: g }; ctx.send('mv', S.lastMsg, serialize()); }
    if (f[0] === 4) { S.over = true; S.winner = 1 - meIdx(); finishGame(); }
    else afterChange();
  }

  function onFeedback(g, f) {
    if (S.over || !S.pending) return;
    g = String(g);
    S.myLog.unshift([g, f[0], f[1]]);
    S.pending = false;
    S.turn = 1 - meIdx();
    ctx.sfx.play(f[0] === 4 ? 'good' : (f[0] + f[1] > 0 ? 'good' : 'bad'));
    if (f[0] === 4) { S.over = true; S.winner = meIdx(); finishGame(); }
    else afterChange();
  }

  function finishGame() {
    renderAll();
    later(() => {
      const i = meIdx();
      if (S.winner === i) ctx.finish('win', '你仅用 ' + S.myLog.length + ' 次猜测破解了对手的密码！');
      else ctx.finish('lose', '对手用 ' + S.oppLog.length + ' 次猜测破解了你的密码 ' + S.secret);
    }, 800);
  }

  function aiGuess() {
    if (S.over || S.turn !== 1 || ctx.mode !== 'ai') return;
    aiCands = aiCands.filter(c => S.myLog.every(e => { const f = feedback(e[0], c); return f[0] === e[1] && f[1] === e[2]; }));
    if (!aiCands.length) seedCands();
    const g = aiCands.splice(Math.floor(Math.random() * aiCands.length), 1)[0];
    onGuess(g);
  }

  function serialize() {
    return { g: 'bulls', secret: S.secret, log: S.myLog.slice(), olog: S.oppLog.slice(), turn: S.turn, over: S.over, w: S.winner };
  }

  return {
    create(c) {
      ctx = c;
      clearTimers();
      S.secret = randSecret();
      S.myLog = []; S.oppLog = []; S.turn = 0; S.over = false; S.pending = false; S.input = ''; S.winner = -1; S.lastMsg = null;
      seedCands();
      aiSecret = randSecret();
      buildUI();
      afterChange();
      c.onMsg((k, d) => {
        if (k !== 'mv' || !d) return;
        if (d.fb) onFeedback(d.g, d.fb);
        else if (d.g != null) onGuess(d.g);
      });
      c.onRestore(s => {
        const mine = s && s['s' + c.side];
        if (!mine || mine.g !== 'bulls' || !mine.secret) return;
        clearTimers();
        S.secret = mine.secret;
        S.over = !!mine.over;
        S.turn = mine.turn || 0;
        S.winner = mine.w == null ? -1 : mine.w;
        const theirs = s['s' + (1 - c.side)];
        const tOk = theirs && theirs.g === 'bulls';
        S.myLog = (tOk && Array.isArray(theirs.olog)) ? theirs.olog.slice() : (Array.isArray(mine.log) ? mine.log.slice() : []);
        S.oppLog = (tOk && Array.isArray(theirs.log)) ? theirs.log.slice() : (Array.isArray(mine.olog) ? mine.olog.slice() : []);
        S.pending = false;
        S.input = '';
        if (S.over && S.winner >= 0) { renderAll(); ctx.finish(S.winner === meIdx() ? 'win' : 'lose', '猜数字对决已结束'); }
        else afterChange();
      });
      c.onPeer(online => {
        if (!online) return;
        buildUI();
        renderAll();
        if (S.over) return;
        if (S.turn === meIdx()) { ctx.turn(0); ctx.setStatus('你的回合'); }
        else ctx.setStatus('对方猜测中…');
        if (S.lastMsg && !S.over) c.send('mv', S.lastMsg, serialize());
      });
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, serialize());
      return { destroy() { clearTimers(); } };
    }
  };
})();
