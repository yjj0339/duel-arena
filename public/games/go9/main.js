'use strict';
window.GameDef = (() => {
  const N = 9;
  const S = { b: null, turn: 0, caps: [0, 0], passes: 0, last: -1, prev: null, over: false, anim: null, fade: [], my: 0 };
  let ctx = null, cv = null, g = null, cw = 0, cell = 0, pad = 0, dpr = 1, info = null;
  const hx = i => pad + i * cell;

  function start() {
    S.b = new Array(N * N).fill(0);
    S.turn = 0; S.caps = [0, 0]; S.passes = 0; S.last = -1; S.prev = null;
    S.over = false; S.anim = null; S.fade = [];
  }

  function nbr(j) {
    const x = j % N, y = (j / N) | 0, o = [];
    if (x > 0) o.push(j - 1);
    if (x < N - 1) o.push(j + 1);
    if (y > 0) o.push(j - N);
    if (y < N - 1) o.push(j + N);
    return o;
  }

  function group(bd, i) {
    const c = bd[i], stones = [], libs = new Set(), seen = new Set([i]);
    const st = [i];
    while (st.length) {
      const j = st.pop();
      stones.push(j);
      for (const n of nbr(j)) {
        if (bd[n] === 0) libs.add(n);
        else if (bd[n] === c && !seen.has(n)) { seen.add(n); st.push(n); }
      }
    }
    return { stones, libs };
  }

  function simulate(i, me) {
    const op = 3 - me;
    const nb = S.b.slice();
    nb[i] = me;
    const removed = [];
    const seen = new Set();
    for (const n of nbr(i)) {
      if (nb[n] === op && !seen.has(n)) {
        const gp = group(nb, n);
        for (const st of gp.stones) seen.add(st);
        if (gp.libs.size === 0) {
          for (const st of gp.stones) { nb[st] = 0; removed.push(st); }
        }
      }
    }
    if (removed.length === 0 && group(nb, i).libs.size === 0) return null;
    if (S.prev === nb.join(',')) return null;
    return { b: nb, removed, caps: removed.length };
  }

  function tryPlay(x, y, net) {
    if (S.over) return false;
    const i = y * N + x;
    if (S.b[i] !== 0) return false;
    const me = S.turn + 1, op = 3 - me;
    const sim = simulate(i, me);
    if (!sim) {
      if (!net) { ctx.toast('禁着点：自杀或劫争，不可落子'); ctx.sfx.play('bad'); }
      return false;
    }
    S.prev = S.b.join(',');
    for (const st of sim.removed) S.fade.push({ i: st, p: op, t0: performance.now() });
    S.caps[S.turn] += sim.caps;
    S.b = sim.b;
    S.last = i;
    S.passes = 0;
    S.turn = 1 - S.turn;
    S.anim = { i, p: me, t0: performance.now() };
    ctx.sfx.play('place');
    if (ctx.mode === 'online' && !net) ctx.send('mv', { x, y }, ser());
    updateInfo();
    afterTurn();
    return true;
  }

  function doPass(net) {
    if (S.over) return;
    S.passes++;
    S.last = -1;
    S.turn = 1 - S.turn;
    ctx.sfx.play('click');
    if (ctx.mode === 'online' && !net) ctx.send('mv', { p: 1 }, ser());
    updateInfo();
    if (S.passes >= 2) { endScoring(); return; }
    afterTurn();
  }

  function scoring() {
    let bs = 0, ws = 0;
    for (let i = 0; i < N * N; i++) {
      if (S.b[i] === 1) bs++;
      else if (S.b[i] === 2) ws++;
    }
    const seen = new Set();
    for (let i = 0; i < N * N; i++) {
      if (S.b[i] !== 0 || seen.has(i)) continue;
      const st = [i], cells = [], borders = new Set();
      seen.add(i);
      while (st.length) {
        const j = st.pop();
        cells.push(j);
        for (const n of nbr(j)) {
          if (S.b[n] === 0) { if (!seen.has(n)) { seen.add(n); st.push(n); } }
          else borders.add(S.b[n]);
        }
      }
      if (borders.size === 1) {
        if (borders.has(1)) bs += cells.length; else ws += cells.length;
      }
    }
    return { b: bs, w: ws + 5.5 };
  }

  function endScoring() {
    S.over = true;
    const sc = scoring();
    const bWin = sc.b > sc.w;
    const detail = '终局数子 黑 ' + sc.b + ' : 白 ' + sc.w + '（含贴目 5.5）';
    updateInfo();
    setTimeout(() => {
      if (S.my === 0) ctx.finish(bWin ? 'win' : 'lose', detail);
      else ctx.finish(bWin ? 'lose' : 'win', detail);
    }, 600);
  }

  function ser() { return { g: 'go9', f: S.b.slice(), t: S.turn, c: S.caps.slice(), p: S.passes, l: S.last, pv: S.prev || '' }; }
  function restore(s) {
    const mine = s && (s['s' + S.my] || s.s0 || s.s1);
    if (!mine || !mine.f) return;
    S.b = mine.f.slice();
    S.turn = mine.t || 0;
    S.caps = mine.c || [0, 0];
    S.passes = mine.p || 0;
    S.last = typeof mine.l === 'number' ? mine.l : -1;
    S.prev = mine.pv || null;
    S.over = false; S.anim = null; S.fade = [];
    updateInfo();
    draw();
    afterTurn();
  }

  function updateInfo() {
    if (!info) return;
    if (S.over) { info.textContent = '对局结束'; return; }
    const sc = scoring();
    info.textContent = '提子 黑 ' + S.caps[0] + ' : 白 ' + S.caps[1] + ' · 停着 ' + S.passes + ' · 目差估算 黑 ' + sc.b + ' : 白 ' + sc.w;
  }

  function afterTurn() {
    if (S.over) return;
    draw();
    if (S.turn === S.my) { ctx.turn(0); ctx.setStatus('你的回合 · 点击棋盘落子或停一手'); }
    else {
      ctx.turn(1); ctx.setStatus('等待对方落子…');
      if (ctx.mode === 'ai') setTimeout(aiMove, 500 + Math.random() * 450);
    }
  }

  function aiMove() {
    if (S.over || S.turn !== 1 || ctx.mode !== 'ai') return;
    let best = null, bs = -1e9;
    for (let i = 0; i < N * N; i++) {
      if (S.b[i] !== 0) continue;
      const x = i % N, y = (i / N) | 0;
      const sim = simulate(i, 2);
      if (!sim) continue;
      let sc = sim.caps * 42 + Math.random() * 6;
      const gl = group(sim.b, i).libs.size;
      if (gl === 1) sc -= 34;
      else if (gl === 2) sc -= 6;
      for (const n of nbr(i)) {
        if (S.b[n] === 2) {
          const gp = group(S.b, n);
          if (gp.libs.size === 1 && group(sim.b, n).libs.size > 1) sc += 24 + gp.stones.length * 7;
        } else if (S.b[n] === 1) {
          const gp = group(sim.b, n);
          if (gp.libs.size === 1) sc += 8 + gp.stones.length * 5;
        }
      }
      const ln = Math.min(x, N - 1 - x, y, N - 1 - y);
      sc += ln === 0 ? -8 : ln === 1 ? 1 : ln === 2 ? 13 : ln === 3 ? 9 : 4;
      sc -= (Math.abs(x - 4) + Math.abs(y - 4)) * .6;
      let orthoOwn = 0, diagEn = 0;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + d[0], ny = y + d[1];
        if (nx >= 0 && nx < N && ny >= 0 && ny < N && S.b[ny * N + nx] === 2) orthoOwn++;
      }
      for (const d of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + d[0], ny = y + d[1];
        if (nx >= 0 && nx < N && ny >= 0 && ny < N && S.b[ny * N + nx] === 1) diagEn++;
      }
      if (orthoOwn === 4 && diagEn === 0) sc -= 500;
      if (sc > bs) { bs = sc; best = [x, y]; }
    }
    if (best && bs > 2) tryPlay(best[0], best[1], false);
    else doPass(false);
  }

  function stone(x, y, p, sc, al) {
    const r = cell * .44 * (sc || 1);
    const cx = hx(x), cy = hx(y);
    g.save();
    g.globalAlpha = al == null ? 1 : al;
    g.beginPath(); g.arc(cx, cy + r * .12, r, 0, 7);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.filter = 'blur(2px)'; g.fill(); g.filter = 'none';
    const grd = g.createRadialGradient(cx - r * .35, cy - r * .4, r * .1, cx, cy, r);
    if (p === 1) { grd.addColorStop(0, '#5a5a5e'); grd.addColorStop(.55, '#26262a'); grd.addColorStop(1, '#0a0a0c'); }
    else { grd.addColorStop(0, '#ffffff'); grd.addColorStop(.6, '#f2f2f5'); grd.addColorStop(1, '#d8d8de'); }
    g.beginPath(); g.arc(cx, cy, r, 0, 7);
    g.fillStyle = grd; g.fill();
    if (p === 2) { g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1; g.stroke(); }
    g.beginPath(); g.arc(cx - r * .3, cy - r * .35, r * .18, 0, 7);
    g.fillStyle = p === 1 ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.9)'; g.fill();
    g.restore();
  }

  function draw(t) {
    if (!g) return;
    const tt = t || performance.now();
    g.clearRect(0, 0, cw, cw);
    const bg = g.createLinearGradient(0, 0, cw, cw);
    bg.addColorStop(0, '#fdf6e7'); bg.addColorStop(1, '#efe0c2');
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, cw, cw, 18); g.fill();
    g.strokeStyle = 'rgba(139,104,58,.5)'; g.lineWidth = 1.4;
    for (let i = 0; i < N; i++) {
      g.beginPath(); g.moveTo(hx(0), hx(i)); g.lineTo(hx(N - 1), hx(i)); g.stroke();
      g.beginPath(); g.moveTo(hx(i), hx(0)); g.lineTo(hx(i), hx(N - 1)); g.stroke();
    }
    g.strokeStyle = 'rgba(139,104,58,.9)'; g.lineWidth = 2.2;
    g.strokeRect(hx(0), hx(0), cell * (N - 1), cell * (N - 1));
    g.fillStyle = 'rgba(139,104,58,.9)';
    for (const [sx, sy] of [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]]) {
      g.beginPath(); g.arc(hx(sx), hx(sy), cell * .09, 0, 7); g.fill();
    }
    for (let i = 0; i < N * N; i++) if (S.b[i]) stone(i % N, (i / N) | 0, S.b[i]);
    for (let fi = S.fade.length - 1; fi >= 0; fi--) {
      const f = S.fade[fi];
      const p = (tt - f.t0) / 320;
      if (p >= 1) { S.fade.splice(fi, 1); continue; }
      stone(f.i % N, (f.i / N) | 0, f.p, 1 - .5 * p, 1 - p);
    }
    if (S.last >= 0 && S.b[S.last] && !S.anim) {
      g.beginPath(); g.arc(hx(S.last % N), hx((S.last / N) | 0), cell * .12, 0, 7);
      g.fillStyle = S.b[S.last] === 1 ? '#f5f5f5' : '#222226';
      g.fill();
    }
    if (S.anim) {
      const p = Math.min(1, (tt - S.anim.t0) / 220);
      const e = 1 - Math.pow(1 - p, 3);
      stone(S.anim.i % N, (S.anim.i / N) | 0, S.anim.p, .3 + .7 * e * (1 + Math.sin(e * Math.PI) * .12), e);
      if (p < 1) requestAnimationFrame(draw); else { S.anim = null; draw(); }
    } else if (S.fade.length) {
      requestAnimationFrame(draw);
    }
  }

  function onResize() {
    const w = Math.min(560, ctx.root.clientWidth - 8, window.innerWidth - 48);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cw = w;
    cell = w / (N + 1);
    pad = cell;
    cv.width = cw * dpr; cv.height = cw * dpr;
    cv.style.width = cw + 'px'; cv.style.height = cw + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  return {
    create(c) {
      ctx = c;
      start();
      S.my = c.mode === 'ai' ? 0 : c.side;
      cv = document.createElement('canvas');
      cv.className = 'gk-cv';
      cv.style.cssText = 'border-radius:18px;box-shadow:0 10px 34px rgba(120,85,30,.18),0 2px 6px rgba(0,0,0,.08);touch-action:manipulation';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      info = document.createElement('div');
      info.style.cssText = 'font-size:13px;color:var(--ink2);font-weight:600;margin-top:10px;text-align:center;letter-spacing:.5px';
      c.root.appendChild(info);
      const passBtn = document.createElement('button');
      passBtn.className = 'gk-btn ghost';
      passBtn.style.cssText = 'margin-top:10px;padding:8px 24px;font-size:13px';
      passBtn.textContent = '停一手 · Pass';
      passBtn.onclick = () => { if (!S.over && S.turn === S.my && !S.anim) doPass(false); };
      c.root.appendChild(passBtn);
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:12px;color:var(--ink2);font-weight:600;margin-top:8px;text-align:center';
      hint.textContent = '中国规则 · 白贴 5.5 目 · 双停着数子（活子 + 独占围空）';
      c.root.appendChild(hint);
      onResize();
      window.addEventListener('resize', onResize);
      cv.addEventListener('pointerdown', e => {
        if (S.over || S.anim || S.turn !== S.my) return;
        const r = cv.getBoundingClientRect();
        const x = Math.round((e.clientX - r.left - pad) / cell);
        const y = Math.round((e.clientY - r.top - pad) / cell);
        if (x < 0 || x >= N || y < 0 || y >= N) return;
        tryPlay(x, y, false);
      });
      c.onMsg((k, d) => {
        if (k === 'mv' && d && !S.over) {
          if (d.p) doPass(true);
          else if (typeof d.x === 'number') tryPlay(d.x, d.y, true);
        }
      });
      c.onRestore(s => restore(s));
      updateInfo();
      afterTurn();
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, ser());
      return { destroy() { window.removeEventListener('resize', onResize); } };
    }
  };
})();
