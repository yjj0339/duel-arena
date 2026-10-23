'use strict';
window.GameDef = (() => {
  let ctx = null;
  const S = { round: 1, attempt: 0, wins: [0, 0], lastMs: [null, null], phase: 'idle', myMs: null, oppMs: null, over: false, champ: -1 };
  let ui = {}, fireTimer = null, nextTimer = null, aiTimer = null, fireAt = 0;

  const css = document.createElement('style');
  css.textContent = `
  .qd-wrap{display:flex;flex-direction:column;align-items:center;gap:14px;padding:10px 0;user-select:none;-webkit-user-select:none}
  .qd-scorebar{display:flex;align-items:center;justify-content:space-between;width:min(520px,90vw)}
  .qd-stars{display:flex;gap:3px;font-size:19px;width:150px}
  .qd-stars.r{justify-content:flex-end}
  .qd-star{color:#e2e5ef;text-shadow:0 1px 0 #fff}
  .qd-star.on{color:#ffb340;text-shadow:0 0 10px rgba(255,179,64,.55);animation:qdpop .45s var(--ease)}
  @keyframes qdpop{40%{transform:scale(1.5)}}
  .qd-round{font-weight:800;font-size:14px;color:var(--ink2)}
  .qd-stage{position:relative;overflow:hidden;width:min(520px,90vw);border-radius:20px;padding:22px 20px;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(160deg,#fffdf7,#fdf3e3 55%,#f8e7cf);border:1px solid #f0e0c4;box-shadow:0 10px 30px rgba(180,140,60,.14),inset 0 1px 0 rgba(255,255,255,.7);cursor:pointer}
  .qd-side{display:flex;flex-direction:column;align-items:center;gap:7px;z-index:1;max-width:96px}
  .qd-av{width:62px;height:62px;border-radius:50%;display:grid;place-items:center;font-size:25px;font-weight:800;color:#fff;background:linear-gradient(135deg,#ff6482,#ff375f);box-shadow:0 6px 16px rgba(255,55,95,.35),inset 0 1px 0 rgba(255,255,255,.45)}
  .qd-av.foe{background:linear-gradient(135deg,#64a3ff,#3478f6);box-shadow:0 6px 16px rgba(52,120,246,.35),inset 0 1px 0 rgba(255,255,255,.45)}
  .qd-avname{font-size:12px;font-weight:700;color:var(--ink2);max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .qd-mid{display:flex;flex-direction:column;align-items:center;gap:8px;z-index:1}
  .qd-badge{font-size:32px;filter:drop-shadow(0 4px 8px rgba(120,80,20,.3))}
  .qd-big{font-size:30px;font-weight:900;color:#6b5537;letter-spacing:2px;white-space:nowrap}
  .qd-big.breath{animation:qdbreath 1.5s ease-in-out infinite}
  @keyframes qdbreath{50%{transform:scale(1.08);opacity:.72}}
  .qd-big.boom{color:#ff2442;animation:qdboom .5s var(--ease);text-shadow:0 0 24px rgba(255,36,66,.5)}
  @keyframes qdboom{0%{transform:scale(.4)}55%{transform:scale(1.5)}100%{transform:scale(1.15)}}
  .qd-stage.qd-fire{animation:qdshake .45s linear}
  @keyframes qdshake{0%,100%{transform:translate(0,0)}20%{transform:translate(-6px,2px)}40%{transform:translate(5px,-3px)}60%{transform:translate(-4px,-2px)}80%{transform:translate(3px,2px)}}
  .qd-flash{position:absolute;inset:0;background:radial-gradient(circle,rgba(255,60,60,.55),rgba(255,60,60,0) 72%);opacity:0;pointer-events:none;transition:opacity .5s}
  .qd-stage.qd-fire .qd-flash{opacity:1;transition:opacity .05s}
  .qd-bars{width:min(520px,90vw);display:flex;flex-direction:column;gap:8px;min-height:6px}
  .qd-brow{display:flex;align-items:center;gap:10px;animation:qdslide .45s var(--ease)}
  @keyframes qdslide{from{opacity:0;transform:translateY(10px)}}
  .qd-bname{width:86px;font-size:12px;font-weight:700;color:var(--ink2);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .qd-btrack{flex:1;height:14px;border-radius:7px;background:#eef0f6;overflow:hidden}
  .qd-bar{height:100%;border-radius:7px}
  .qd-bar.win{background:linear-gradient(90deg,#39d98a,#30b15c)}
  .qd-bar.lose{background:linear-gradient(90deg,#ff8fa3,#ff375f)}
  .qd-bar.foul{background:linear-gradient(90deg,#ffc53d,#ff9500)}
  .qd-bval{width:78px;font-size:12px;font-weight:800;color:var(--ink2)}
  .qd-hint{font-size:13px;font-weight:600;color:var(--ink3);min-height:18px;text-align:center}
  `;
  document.head.appendChild(css);

  function meIdx() { return ctx.mode === 'ai' ? 0 : ctx.side; }
  function clearAll() { clearTimeout(fireTimer); clearTimeout(nextTimer); clearTimeout(aiTimer); }

  function stars(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += '<span class="qd-star' + (i < n ? ' on' : '') + '>★</span>';
    return s;
  }

  function buildUI() {
    ctx.root.innerHTML = '';
    const w = document.createElement('div');
    w.className = 'qd-wrap';
    w.innerHTML = `
      <div class="qd-scorebar">
        <div class="qd-stars" id="qdMS"></div>
        <div class="qd-round" id="qdRnd"></div>
        <div class="qd-stars r" id="qdOS"></div>
      </div>
      <div class="qd-stage" id="qdStage">
        <div class="qd-side">
          <div class="qd-av">${ctx.me.name.slice(0, 1).toUpperCase()}</div>
          <div class="qd-avname">${ctx.me.name}</div>
        </div>
        <div class="qd-mid">
          <div class="qd-badge">🤠</div>
          <div class="qd-big" id="qdBig">准备…</div>
        </div>
        <div class="qd-side">
          <div class="qd-av foe">${ctx.opp.name.slice(0, 1).toUpperCase()}</div>
          <div class="qd-avname">${ctx.opp.name}</div>
        </div>
        <div class="qd-flash"></div>
      </div>
      <div class="qd-bars" id="qdBars"></div>
      <div class="qd-hint" id="qdHint">倒计时结束瞬间点击屏幕开火</div>`;
    ctx.root.appendChild(w);
    ui = {
      stage: w.querySelector('#qdStage'),
      big: w.querySelector('#qdBig'),
      bars: w.querySelector('#qdBars'),
      hint: w.querySelector('#qdHint'),
      rnd: w.querySelector('#qdRnd'),
      ms: w.querySelector('#qdMS'),
      os: w.querySelector('#qdOS')
    };
    w.addEventListener('pointerdown', onTap);
  }

  function renderScore() {
    ui.ms.innerHTML = stars(S.wins[meIdx()]);
    ui.os.innerHTML = stars(S.wins[1 - meIdx()]);
    ui.rnd.textContent = S.over ? '终局' : '第 ' + S.round + ' 局';
  }

  function startRound() {
    clearAll();
    S.phase = 'wait'; S.myMs = null; S.oppMs = null;
    ui.stage.classList.remove('qd-fire');
    ui.big.classList.remove('boom');
    ui.big.classList.add('breath');
    ui.big.textContent = '蓄势待发…';
    ui.bars.innerHTML = '';
    ui.hint.textContent = '开火前点击视为抢跑';
    ctx.turn(-1);
    ctx.setStatus('蓄势待发…');
    ctx.setOppStatus('蓄势待发…');
    renderScore();
    const t = 2000 + hashSeed(ctx.seed + ':' + S.round + ':' + S.attempt) % 4000;
    fireTimer = setTimeout(fire, t);
    if (ctx.mode === 'ai') planAI(t);
  }

  function fire() {
    if (S.phase !== 'wait') return;
    S.phase = 'fire';
    fireAt = performance.now();
    ui.big.classList.remove('breath');
    ui.big.classList.add('boom');
    ui.big.textContent = '开火！';
    ui.stage.classList.add('qd-fire');
    ctx.sfx.play('pop');
    ctx.setStatus('开火！立刻点击！');
    ui.hint.textContent = '点击！';
  }

  function onTap() {
    if (S.over) return;
    if (S.phase === 'wait') {
      clearTimeout(fireTimer);
      S.phase = 'waitopp';
      S.myMs = -1;
      ui.big.classList.remove('breath');
      ui.big.textContent = '抢跑了！';
      ui.stage.classList.add('qd-fire');
      ctx.sfx.play('bad');
      ctx.setStatus('抢跑！等待对方…');
      ui.hint.textContent = '等待对方反应…';
      sendMs();
    } else if (S.phase === 'fire') {
      S.phase = 'waitopp';
      S.myMs = Math.max(1, Math.round(performance.now() - fireAt));
      ctx.sfx.play('click');
      ctx.setStatus('反应 ' + S.myMs + 'ms，等待对方…');
      ui.hint.textContent = '等待对方反应…';
      sendMs();
    }
  }

  function sendMs() {
    if (ctx.mode !== 'online') return;
    ctx.send('mv', { ms: S.myMs, r: S.round, at: S.attempt }, serialize());
  }

  function planAI(t) {
    clearTimeout(aiTimer);
    if (Math.random() < .07) {
      const dt = Math.max(250, t - 150 - Math.random() * 700);
      aiTimer = setTimeout(() => { if (!S.over && S.oppMs == null) recvOpp(-1); }, dt);
    } else {
      const rt = Math.round(180 + Math.random() * 260);
      aiTimer = setTimeout(() => { if (!S.over && S.oppMs == null) recvOpp(rt); }, t + rt);
    }
  }

  function recvOpp(ms) {
    if (S.over || S.oppMs != null) return;
    S.oppMs = ms;
    ctx.setOppStatus(ms === -1 ? '对方抢跑了！' : '对方反应 ' + ms + 'ms');
    if (S.myMs != null) judge();
    else if (S.phase === 'wait') ui.hint.textContent = '对方已出手，等你开火！';
  }

  function judge() {
    S.phase = 'result';
    const m = [null, null];
    m[meIdx()] = S.myMs; m[1 - meIdx()] = S.oppMs;
    S.lastMs = m;
    if (m[0] === -1 && m[1] === -1) {
      S.attempt++;
      ui.big.textContent = '无效！重赛';
      ui.hint.textContent = '双方抢跑，本局作废';
      ctx.toast('双方抢跑，本局重赛！');
      renderBars(-2);
      syncSnap();
      nextTimer = setTimeout(startRound, 1500);
      return;
    }
    const w = m[0] === -1 ? 1 : m[1] === -1 ? 0 : (m[0] <= m[1] ? 0 : 1);
    S.wins[w]++;
    renderBars(w);
    renderScore();
    ctx.sfx.play(w === meIdx() ? 'good' : 'bad');
    if (S.wins[w] >= 3) {
      S.over = true; S.champ = w;
      syncSnap();
      nextTimer = setTimeout(() => endGame(w), 1300);
    } else {
      S.round++; S.attempt = 0;
      syncSnap();
      nextTimer = setTimeout(startRound, 1900);
    }
  }

  function syncSnap() { if (ctx.mode === 'online') ctx.send('mv', { j: 1 }, serialize()); }

  function renderBars(w) {
    ui.bars.innerHTML = [0, 1].map(i => {
      const v = S.lastMs[i];
      if (v == null) return '';
      const name = (i === meIdx() ? ctx.me.name : ctx.opp.name) + (w === i ? ' 👑' : '');
      const foul = v === -1;
      const pct = foul ? 100 : Math.max(8, Math.min(100, v / 900 * 100));
      const cls = foul ? 'foul' : w === i ? 'win' : 'lose';
      const txt = foul ? '抢跑' : v + ' ms';
      return '<div class="qd-brow"><div class="qd-bname">' + name + '</div><div class="qd-btrack"><div class="qd-bar ' + cls + '" style="width:' + pct + '%"></div></div><div class="qd-bval">' + txt + '</div></div>';
    }).join('');
  }

  function endGame(w) {
    const i = meIdx();
    ui.big.textContent = w === i ? '你赢了！' : '对手获胜';
    ui.hint.textContent = '对局结束';
    if (w === i) ctx.finish('win', '反应对决 ' + S.wins[i] + ' : ' + S.wins[1 - i] + '，你的枪快如闪电！');
    else ctx.finish('lose', '反应对决 ' + S.wins[i] + ' : ' + S.wins[1 - i] + '，对手拔枪更快。');
  }

  function endGameView() {
    ui.big.textContent = S.champ === meIdx() ? '你赢了！' : '对手获胜';
    ui.hint.textContent = '对局结束';
    renderBars(S.champ);
    renderScore();
  }

  function serialize() {
    return { g: 'quickdraw', round: S.round, attempt: S.attempt, wins: S.wins.slice(), lastMs: S.lastMs.slice(), over: S.over, champ: S.champ };
  }

  return {
    create(c) {
      ctx = c;
      clearAll();
      S.round = 1; S.attempt = 0; S.wins = [0, 0]; S.lastMs = [null, null];
      S.phase = 'idle'; S.myMs = null; S.oppMs = null; S.over = false; S.champ = -1;
      buildUI();
      startRound();
      c.onMsg((k, d) => {
        if (k !== 'mv' || !d || d.ms == null) return;
        if (S.over || d.r !== S.round || d.at !== S.attempt) return;
        recvOpp(d.ms);
      });
      c.onRestore(s => {
        const mine = s && s['s' + c.side];
        if (!mine || mine.g !== 'quickdraw') return;
        clearAll();
        S.round = mine.round || 1;
        S.attempt = mine.attempt || 0;
        S.wins = Array.isArray(mine.wins) && mine.wins.length === 2 ? mine.wins.slice() : [0, 0];
        S.lastMs = Array.isArray(mine.lastMs) && mine.lastMs.length === 2 ? mine.lastMs.slice() : [null, null];
        S.over = !!mine.over;
        S.champ = mine.champ == null ? -1 : mine.champ;
        if (S.over) { endGameView(); ctx.finish(S.champ === meIdx() ? 'win' : 'lose', '快枪手对决已结束'); }
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
      return { destroy() { clearAll(); } };
    }
  };
})();
