'use strict';
window.GameDef = (() => {
  const N = 8;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const WT = [
    [120, -24, 16, 10, 10, 16, -24, 120],
    [-24, -40, -6, -4, -4, -6, -40, -24],
    [16, -6, 14, 6, 6, 14, -6, 16],
    [10, -4, 6, 4, 4, 6, -4, 10],
    [10, -4, 6, 4, 4, 6, -4, 10],
    [16, -6, 14, 6, 6, 14, -6, 16],
    [-24, -40, -6, -4, -4, -6, -40, -24],
    [120, -24, 16, 10, 10, 16, -24, 120]
  ];
  const S = { f: null, turn: 0, over: false, last: null, flips: [], legal: [] };
  let ctx = null, cv = null, g = null, cell = 0, pad = 0, W = 0, dpr = 1;
  const myIdx = () => ctx.mode === 'ai' ? 0 : ctx.side;
  const pc = c => pad + c * cell + cell / 2;

  function newGame() {
    S.f = Array.from({ length: N }, () => new Array(N).fill(0));
    S.f[3][3] = 2; S.f[4][4] = 2; S.f[3][4] = 1; S.f[4][3] = 1;
    S.turn = 0; S.over = false; S.last = null; S.flips = []; S.legal = [];
  }
  function serialize() {
    const f = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) f.push(S.f[r][c]);
    return { g: 'reversi', f, t: S.turn };
  }
  function applySnap(m) {
    let k = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) S.f[r][c] = m.f[k++];
    S.turn = m.t || 0; S.over = false; S.flips = []; S.last = null;
    draw(); afterTurn();
  }
  function deserialize(s) { const m = s && (s['s' + ctx.side] || s.s0 || s.s1); if (m && m.f) applySnap(m); }

  function flipsFor(r, c, p) {
    if (S.f[r][c]) return null;
    const o = 3 - p, out = [];
    for (const [dr, dc] of DIRS) {
      const line = [];
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < N && cc >= 0 && cc < N && S.f[rr][cc] === o) { line.push([rr, cc]); rr += dr; cc += dc; }
      if (line.length && rr >= 0 && rr < N && cc >= 0 && cc < N && S.f[rr][cc] === p) for (const q of line) out.push(q);
    }
    return out.length ? out : null;
  }
  function legalMoves(p) {
    const m = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (flipsFor(r, c, p)) m.push([r, c]);
    return m;
  }
  function count(p) { let n = 0; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (S.f[r][c] === p) n++; return n; }

  function doMove(r, c) {
    if (S.over) return;
    const p = S.turn + 1;
    const fl = flipsFor(r, c, p);
    if (!fl) return;
    S.f[r][c] = p;
    for (const q of fl) S.f[q[0]][q[1]] = p;
    S.last = [r, c];
    ctx.sfx.play('place');
    S.flips = fl.map((q, i) => ({ r: q[0], c: q[1], from: 3 - p, t0: performance.now() + 60 + i * 45 }));
    advance();
  }
  function advance() {
    const cur = S.turn, nxt = 1 - cur;
    if (!legalMoves(nxt + 1).length) {
      if (!legalMoves(cur + 1).length) { endGame(); return; }
      const my = myIdx();
      ctx.toast(nxt === my ? '你无子可下，跳过回合' : '对方无子可下，继续行动');
      ctx.sfx.play('tick');
    } else S.turn = nxt;
    draw();
    afterTurn();
  }
  function endGame() {
    const b = count(1), w = count(2), my = myIdx();
    const ms = my === 0 ? b : w, os = my === 0 ? w : b;
    S.over = true; S.turn = -1; S.legal = []; S.flips = [];
    draw();
    setTimeout(() => ctx.finish(ms > os ? 'win' : ms < os ? 'lose' : 'draw', '黑 ' + b + ' : ' + w + ' 白'), 800);
  }
  function updateStatus() {
    const b = count(1), w = count(2), my = myIdx();
    const ms = my === 0 ? b : w, os = my === 0 ? w : b;
    const mSym = my === 0 ? '●' : '○', oSym = my === 0 ? '○' : '●';
    ctx.setStatus(mSym + ' ' + ms + (S.turn === my ? ' · 你的回合' : ' · 对方行动中'));
    ctx.setOppStatus(oSym + ' ' + os);
  }
  function afterTurn() {
    if (S.over) return;
    S.legal = legalMoves(S.turn + 1);
    const my = myIdx();
    updateStatus();
    if (S.turn === my) ctx.turn(0);
    else { ctx.turn(1); if (ctx.mode === 'ai') setTimeout(aiMove, 520 + Math.random() * 420); }
  }

  function disc(x, y, r, p, sx) {
    g.save(); g.translate(x, y); g.scale(sx == null ? 1 : sx, 1);
    g.beginPath(); g.arc(0, r * .1, r, 0, 7);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.filter = 'blur(2.5px)'; g.fill(); g.filter = 'none';
    const grd = g.createRadialGradient(-r * .35, -r * .4, r * .12, 0, 0, r);
    if (p === 1) { grd.addColorStop(0, '#5c5c64'); grd.addColorStop(.55, '#26262c'); grd.addColorStop(1, '#0c0c10'); }
    else { grd.addColorStop(0, '#ffffff'); grd.addColorStop(.6, '#f0f0f4'); grd.addColorStop(1, '#d2d2dc'); }
    g.beginPath(); g.arc(0, 0, r, 0, 7); g.fillStyle = grd; g.fill();
    if (p === 2) { g.strokeStyle = 'rgba(0,0,0,.14)'; g.lineWidth = 1; g.stroke(); }
    g.beginPath(); g.arc(-r * .3, -r * .35, r * .18, 0, 7);
    g.fillStyle = p === 1 ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.95)'; g.fill();
    g.restore();
  }
  function draw(t) {
    if (!g) return;
    const now = t || performance.now();
    g.clearRect(0, 0, W, W);
    const bg = g.createLinearGradient(0, 0, W, W);
    bg.addColorStop(0, '#5cb878'); bg.addColorStop(1, '#3d9c5c');
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, W, W, 18); g.fill();
    g.strokeStyle = 'rgba(0,60,20,.28)'; g.lineWidth = 1;
    for (let i = 1; i < N; i++) {
      g.beginPath(); g.moveTo(pad + i * cell, pad); g.lineTo(pad + i * cell, W - pad); g.stroke();
      g.beginPath(); g.moveTo(pad, pad + i * cell); g.lineTo(W - pad, pad + i * cell); g.stroke();
    }
    g.strokeStyle = 'rgba(0,50,20,.5)'; g.lineWidth = 2;
    g.strokeRect(pad, pad, cell * N, cell * N);
    S.flips = S.flips.filter(f => now < f.t0 + 340);
    const active = new Map();
    for (const f of S.flips) active.set(f.r * N + f.c, f);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const v = S.f[r][c];
      if (!v) continue;
      const f = active.get(r * N + c);
      if (f) {
        const e2 = Math.min(1, Math.max(0, (now - f.t0) / 340));
        const w2 = Math.cos(e2 * Math.PI);
        disc(pc(c), pc(r), cell * .4, w2 >= 0 ? f.from : 3 - f.from, Math.max(.06, Math.abs(w2)));
      } else disc(pc(c), pc(r), cell * .4, v);
    }
    if (S.last) {
      g.beginPath(); g.arc(pc(S.last[1]), pc(S.last[0]), cell * .09, 0, 7);
      g.fillStyle = 'rgba(255,80,110,.9)'; g.fill();
    }
    if (!S.over && S.turn === myIdx()) {
      const col = S.turn === 0 ? 'rgba(15,15,20,.4)' : 'rgba(255,255,255,.8)';
      for (const [r, c] of S.legal) {
        g.beginPath(); g.arc(pc(c), pc(r), cell * .13, 0, 7);
        g.fillStyle = col; g.fill();
      }
    }
    if (S.flips.length) requestAnimationFrame(draw);
  }

  function aiMove() {
    if (S.over || S.turn !== 1 || ctx.mode !== 'ai') return;
    const moves = legalMoves(2);
    if (!moves.length) return;
    let best = null, bs = -Infinity;
    for (const [r, c] of moves) {
      const v = WT[r][c] + flipsFor(r, c, 2).length * 3 + Math.random() * 8;
      if (v > bs) { bs = v; best = [r, c]; }
    }
    if (best) doMove(best[0], best[1]);
  }

  function onResize() {
    const w = Math.min(560, ctx.root.clientWidth - 8, window.innerWidth - 48);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = w; cell = (w - 2 * w * 0.03) / N; pad = w * 0.03;
    cv.width = Math.round(W * dpr); cv.height = Math.round(W * dpr);
    cv.style.width = W + 'px'; cv.style.height = W + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function cellAt(e) {
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < pad || y < pad || x >= pad + N * cell || y >= pad + N * cell) return null;
    return [Math.floor((y - pad) / cell), Math.floor((x - pad) / cell)];
  }
  return {
    create(c) {
      ctx = c;
      newGame();
      cv = document.createElement('canvas');
      cv.style.cssText = 'display:block;margin:0 auto;border-radius:18px;box-shadow:0 12px 34px rgba(35,120,70,.25),0 2px 8px rgba(0,0,0,.08);cursor:pointer;touch-action:manipulation';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      const hint = document.createElement('div');
      hint.style.cssText = 'margin-top:10px;text-align:center;font-size:13px;font-weight:600;color:var(--ink2)';
      hint.textContent = '夹住对方棋子即可翻转 · 无子可下自动跳过 · 终盘子多者胜';
      c.root.appendChild(hint);
      onResize();
      window.addEventListener('resize', onResize);
      cv.addEventListener('pointerdown', e => {
        if (S.over || S.turn !== myIdx() || S.flips.length) return;
        const rc = cellAt(e);
        if (!rc || !flipsFor(rc[0], rc[1], S.turn + 1)) return;
        doMove(rc[0], rc[1]);
        if (ctx.mode === 'online') ctx.send('mv', { r: rc[0], c: rc[1] }, serialize());
      });
      c.onMsg((k, d) => { if (k === 'mv' && d && typeof d.r === 'number') doMove(d.r, d.c); });
      c.onRestore(s => deserialize(s));
      afterTurn();
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, serialize());
      return { destroy() { window.removeEventListener('resize', onResize); } };
    }
  };
})();
