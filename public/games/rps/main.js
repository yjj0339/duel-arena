'use strict';
window.GameDef = (() => {
  let ctx = null;
  const HANDS = ['✊', '✌️', '✋'];
  const NAMES = ['石头', '剪刀', '布'];
  const S = { round: 1, attempt: 0, wins: [0, 0], phase: 'pick', myH: null, mySalt: 0, oppCommit: null, oppH: null, myRevealed: false, over: false, champ: -1, lastW: -2, hist: [] };
  let ui = {}, timers = [], aiH = null, aiSalt = 0;

  const css = document.createElement('style');
  css.textContent = `
  .rps-wrap{display:flex;flex-direction:column;align-items:center;gap:14px;padding:10px 0;user-select:none;-webkit-user-select:none}
  .rps-score{display:flex;align-items:center;justify-content:space-between;width:min(480px,90vw)}
  .rps-stars{display:flex;gap:4px;font-size:20px;width:110px}
  .rps-stars.r{justify-content:flex-end}
  .rps-star{color:#e4e7f0;text-shadow:0 1px 0 #fff}
  .rps-star.on{color:#ffb340;text-shadow:0 0 10px rgba(255,179,64,.55);animation:rpspop .45s var(--ease)}
  @keyframes rpspop{40%{transform:scale(1.5)}}
  .rps-round{font-weight:800;font-size:14px;color:var(--ink2)}
  .rps-arena{display:flex;align-items:center;justify-content:space-between;width:min(480px,90vw);background:linear-gradient(160deg,#fffdf6,#fdf1de 60%,#fbe6c9);border:1px solid #f1e0c0;border-radius:22px;padding:24px 22px;box-shadow:0 10px 28px rgba(190,140,50,.16),inset 0 1px 0 rgba(255,255,255,.7)}
  .rps-hand{width:96px;height:96px;border-radius:50%;display:grid;place-items:center;font-size:46px;background:radial-gradient(circle at 32% 28%,#fff,#edf0f8 72%);border:1px solid #e2e6f1;box-shadow:0 8px 20px rgba(60,80,140,.14),inset 0 2px 0 #fff;transition:transform .35s var(--ease),box-shadow .35s,background .35s}
  .rps-hand.picked{border-color:#f2b13c}
  .rps-arena.reveal .rps-hand.me{transform:scale(1.18) translateX(16px)}
  .rps-arena.reveal .rps-hand.foe{transform:scale(1.18) translateX(-16px)}
  .rps-hand.winner{background:radial-gradient(circle at 32% 28%,#fffbe9,#ffedc4 72%);box-shadow:0 0 0 4px rgba(255,179,64,.4),0 12px 28px rgba(255,160,20,.45);animation:rpswin .6s var(--ease)}
  @keyframes rpswin{40%{transform:scale(1.26)}}
  .rps-vs{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:120px}
  .rps-vstxt{font-weight:900;font-size:24px;color:#c98a2b;letter-spacing:2px;text-shadow:0 1px 0 #fff}
  .rps-lock{font-size:11px;font-weight:800;padding:3px 10px;border-radius:99px;background:rgba(48,177,92,.14);color:#1f9d4d;opacity:0;transform:scale(.8);transition:all .3s var(--ease)}
  .rps-lock.show{opacity:1;transform:scale(1)}
  .rps-status{font-size:15px;font-weight:700;color:var(--ink2);min-height:20px;text-align:center}
  .rps-btns{display:flex;gap:16px;transition:opacity .25s}
  .rps-btns.lock{opacity:.5;pointer-events:none}
  .rps-btn{width:90px;height:90px;border-radius:24px;font-size:42px;line-height:1;background:linear-gradient(180deg,#fff,#f3f5fa);border:1px solid var(--line);cursor:pointer;box-shadow:0 6px 16px rgba(50,70,130,.12),inset 0 2px 0 #fff;transition:transform .18s var(--ease),box-shadow .18s}
  .rps-btn:hover{transform:translateY(-6px) scale(1.05);box-shadow:0 14px 28px rgba(50,70,130,.2)}
  .rps-btn:active{transform:scale(.92)}
  .rps-btn.sel{outline:3px solid #ff9f0a;outline-offset:3px}
  .rps-hint{font-size:12px;font-weight:600;color:var(--ink3);text-align:center}
  `;
  document.head.appendChild(css);

  function meIdx() { return ctx.mode === 'ai' ? 0 : ctx.side; }
  function later(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); return t; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function commitOf(h, salt) {
    let x = (h * 31 + salt) >>> 0;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 7;
    x ^= x << 17; x >>>= 0;
    return x >>> 0;
  }
  function send(d) {
    if (ctx.mode !== 'online') return;
    d.r = S.round; d.at = S.attempt;
    ctx.send('mv', d, serialize());
  }

  function stars(n) {
    let s = '';
    for (let i = 0; i < 3; i++) s += '<span class="rps-star' + (i < n ? ' on' : '') + '>★</span>';
    return s;
  }

  function buildUI() {
    ctx.root.innerHTML = '';
    const w = document.createElement('div');
    w.className = 'rps-wrap';
    w.innerHTML = `
      <div class="rps-score">
        <div class="rps-stars" id="rpsMS"></div>
        <div class="rps-round" id="rpsRnd"></div>
        <div class="rps-stars r" id="rpsOS"></div>
      </div>
      <div class="rps-arena" id="rpsArena">
        <div class="rps-hand me" id="rpsMH">❔</div>
        <div class="rps-vs">
          <div class="rps-vstxt">VS</div>
          <div class="rps-lock" id="rpsLockL">我已锁定 ✓</div>
          <div class="rps-lock" id="rpsLockR">对方已锁定 ✓</div>
        </div>
        <div class="rps-hand foe" id="rpsOH">❔</div>
      </div>
      <div class="rps-status" id="rpsStatus"></div>
      <div class="rps-btns" id="rpsBtns">
        <button class="rps-btn" data-h="0">✊</button>
        <button class="rps-btn" data-h="1">✌️</button>
        <button class="rps-btn" data-h="2">✋</button>
      </div>
      <div class="rps-hint" id="rpsHint"></div>`;
    ctx.root.appendChild(w);
    ui = {
      arena: w.querySelector('#rpsArena'),
      mh: w.querySelector('#rpsMH'),
      oh: w.querySelector('#rpsOH'),
      lockL: w.querySelector('#rpsLockL'),
      lockR: w.querySelector('#rpsLockR'),
      status: w.querySelector('#rpsStatus'),
      hint: w.querySelector('#rpsHint'),
      btns: w.querySelector('#rpsBtns'),
      rnd: w.querySelector('#rpsRnd'),
      ms: w.querySelector('#rpsMS'),
      os: w.querySelector('#rpsOS')
    };
    ui.btns.addEventListener('click', e => {
      const b = e.target.closest('.rps-btn');
      if (b) pick(+b.dataset.h);
    });
  }

  function render() {
    ui.mh.textContent = S.myH == null ? '❔' : HANDS[S.myH];
    ui.mh.classList.toggle('picked', S.myH != null);
    ui.oh.textContent = S.oppH != null ? HANDS[S.oppH] : (S.oppCommit != null ? '🔒' : '❔');
    ui.oh.classList.toggle('picked', S.oppCommit != null);
    ui.lockL.classList.toggle('show', S.myH != null);
    ui.lockR.classList.toggle('show', S.oppCommit != null);
    ui.arena.classList.toggle('reveal', S.phase === 'result');
    ui.mh.classList.toggle('winner', S.phase === 'result' && S.lastW === meIdx());
    ui.oh.classList.toggle('winner', S.phase === 'result' && S.lastW === 1 - meIdx());
    ui.btns.classList.toggle('lock', S.myH != null || S.over);
    ui.btns.querySelectorAll('.rps-btn').forEach(b => b.classList.toggle('sel', S.myH != null && +b.dataset.h === S.myH));
    ui.ms.innerHTML = stars(S.wins[meIdx()]);
    ui.os.innerHTML = stars(S.wins[1 - meIdx()]);
    ui.rnd.textContent = S.over ? '终局' : '第 ' + S.round + ' 局';
  }

  function startRound() {
    clearTimers();
    S.phase = 'pick'; S.myH = null; S.oppH = null; S.oppCommit = null; S.myRevealed = false; S.lastW = -2;
    ui.status.textContent = '选择你的手势';
    ui.hint.textContent = '石头赢剪刀，剪刀赢布，布赢石头 · 先胜 3 局者夺冠';
    ctx.turn(-1);
    ctx.setStatus('选择手势');
    ctx.setOppStatus('选择手势');
    render();
    if (ctx.mode === 'ai') {
      later(() => {
        if (S.over || S.oppCommit != null) return;
        aiH = aiPick();
        aiSalt = 100 + Math.floor(Math.random() * 900);
        recvCommit(commitOf(aiH, aiSalt), S.round, S.attempt);
      }, 500 + Math.random() * 700);
    }
  }

  function aiPick() {
    if (!S.hist.length || Math.random() < .4) return Math.floor(Math.random() * 3);
    const cnt = [0, 0, 0];
    S.hist.forEach(h => cnt[h]++);
    const best = cnt[0] >= cnt[1] && cnt[0] >= cnt[2] ? 0 : cnt[1] >= cnt[2] ? 1 : 2;
    return (best + 1) % 3;
  }

  function pick(h) {
    if (S.over || S.myH != null) return;
    S.myH = h;
    S.mySalt = 100 + Math.floor(Math.random() * 900);
    S.phase = 'committed';
    ctx.sfx.play('place');
    ctx.setStatus('已锁定，等待对方…');
    send({ c: commitOf(h, S.mySalt) });
    if (S.oppCommit != null) doReveal();
    else {
      ui.status.textContent = '已锁定 ✓，等待对方选择…';
      render();
    }
  }

  function recvCommit(cmt, r, at) {
    if (S.over || r !== S.round || at !== S.attempt || S.oppCommit != null) return;
    S.oppCommit = cmt;
    ctx.sfx.play('click');
    ctx.setOppStatus('已锁定 ✓');
    if (S.myH != null) doReveal();
    else {
      S.phase = 'waitopp';
      ui.status.textContent = '对方已锁定 ✓，快选择手势！';
      render();
    }
  }

  function doReveal() {
    if (S.myRevealed) return;
    S.myRevealed = true;
    S.phase = 'reveal';
    ctx.setStatus('揭晓中…');
    send({ h: S.myH, salt: S.mySalt });
    render();
    if (ctx.mode === 'ai') later(() => { if (!S.over) recvReveal(aiH, aiSalt, S.round, S.attempt); }, 400 + Math.random() * 350);
  }

  function recvReveal(h, salt, r, at) {
    if (S.over || r !== S.round || at !== S.attempt || S.phase === 'result' || !S.myRevealed) return;
    if (S.oppCommit == null || commitOf(h, salt) !== S.oppCommit) {
      ctx.toast('手势校验失败，本局重赛');
      later(startRound, 900);
      return;
    }
    S.oppH = h;
    judge();
  }

  function judge() {
    S.phase = 'result';
    if (ctx.mode === 'ai') S.hist.push(S.myH);
    const beats = (a, b) => (b + 1) % 3 === a;
    const w = S.myH === S.oppH ? -1 : (beats(S.myH, S.oppH) ? meIdx() : 1 - meIdx());
    S.lastW = w;
    render();
    ui.status.textContent = w === -1 ? '平局！本局重赛' : NAMES[S.myH] + ' vs ' + NAMES[S.oppH] + ' —— ' + (w === meIdx() ? ctx.me.name : ctx.opp.name) + ' 获胜！';
    ctx.sfx.play(w === -1 ? 'pop' : w === meIdx() ? 'good' : 'bad');
    if (w === -1) {
      send({ s: 1 });
      later(startRound, 1400);
      return;
    }
    S.wins[w]++;
    render();
    if (S.wins[w] >= 3) {
      S.over = true; S.champ = w;
      send({ s: 1 });
      later(() => endGame(w), 1400);
    } else {
      S.round++;
      send({ s: 1 });
      later(startRound, 1700);
    }
  }

  function endGame(w) {
    const i = meIdx();
    render();
    ui.hint.textContent = '对局结束';
    if (w === i) ctx.finish('win', '猜拳 ' + S.wins[i] + ' : ' + S.wins[1 - i] + '，手势之王非你莫属！');
    else ctx.finish('lose', '猜拳 ' + S.wins[i] + ' : ' + S.wins[1 - i] + '，再接再厉。');
  }

  function endGameView() {
    S.phase = 'result';
    S.lastW = S.champ;
    render();
    ui.status.textContent = S.champ === meIdx() ? '你是猜拳之王！' : '对手夺冠';
    ui.hint.textContent = '对局结束';
  }

  function serialize() {
    return { g: 'rps', round: S.round, attempt: S.attempt, wins: S.wins.slice(), phase: S.phase, over: S.over, champ: S.champ };
  }

  return {
    create(c) {
      ctx = c;
      clearTimers();
      S.round = 1; S.attempt = 0; S.wins = [0, 0]; S.phase = 'pick';
      S.myH = null; S.mySalt = 0; S.oppCommit = null; S.oppH = null; S.myRevealed = false;
      S.over = false; S.champ = -1; S.lastW = -2; S.hist = [];
      aiH = null; aiSalt = 0;
      buildUI();
      startRound();
      c.onMsg((k, d) => {
        if (k !== 'mv' || !d) return;
        if (d.c != null) recvCommit(d.c, d.r, d.at);
        else if (d.h != null) recvReveal(d.h, d.salt, d.r, d.at);
      });
      c.onRestore(s => {
        const mine = s && s['s' + c.side];
        if (!mine || mine.g !== 'rps') return;
        clearTimers();
        S.round = mine.round || 1;
        S.attempt = mine.attempt || 0;
        S.wins = Array.isArray(mine.wins) && mine.wins.length === 2 ? mine.wins.slice() : [0, 0];
        S.over = !!mine.over;
        S.champ = mine.champ == null ? -1 : mine.champ;
        if (S.over) { endGameView(); ctx.finish(S.champ === meIdx() ? 'win' : 'lose', '猜拳锦标赛已结束'); }
        else startRound();
      });
      c.onPeer(online => {
        if (!online) { ctx.setStatus('对手断线，等待重连…'); return; }
        buildUI();
        if (S.over) { endGameView(); return; }
        S.attempt++;
        startRound();
      });
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, serialize());
      return { destroy() { clearTimers(); } };
    }
  };
})();
