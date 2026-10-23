'use strict';
window.GameDef = (() => {
  const N = 15;
  const S = { b: null, turn: 1, my: 1, over: false, anim: null, last: null, winLine: null, history: [] };
  let ctx = null, cv = null, g = null, cell = 0, pad = 0, size = 0, dpr = 1;
  const hx = i => pad + i * cell;
  const acc = '#b98a4a';

  function newBoard() { S.b = Array.from({ length: N }, () => new Array(N).fill(0)); S.turn = 1; S.over = false; S.last = null; S.winLine = null; S.history = []; }

  function serialize() {
    const f = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) f.push(S.b[y][x]);
    return { g: 'gomoku', f, t: S.turn, n: S.history.length };
  }
  function deserialize(s) {
    const mine = s && (s['s' + (S.my - 1)] || s.s0 || s.s1);
    if (!mine || !mine.f) return;
    let k = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) S.b[y][x] = s.f[k++];
    S.turn = s.t || 1; S.over = false; S.winLine = null;
    S.last = null;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (S.b[y][x]) S.last = { x, y };
    draw();
  }

  function stone(x, y, p, scale, alpha) {
    const r = cell * 0.42 * (scale || 1);
    const cx = hx(x), cy = hx(y);
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.beginPath(); g.arc(cx, cy + r * 0.12, r, 0, 7);
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
    g.clearRect(0, 0, size, size);
    const bg = g.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#fdf8ee'); bg.addColorStop(1, '#f3ead6');
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, size, size, 18); g.fill();
    g.strokeStyle = 'rgba(139,104,58,.5)'; g.lineWidth = 1.4;
    for (let i = 0; i < N; i++) {
      g.beginPath(); g.moveTo(hx(0), hx(i)); g.lineTo(hx(N - 1), hx(i)); g.stroke();
      g.beginPath(); g.moveTo(hx(i), hx(0)); g.lineTo(hx(i), hx(N - 1)); g.stroke();
    }
    g.strokeStyle = 'rgba(139,104,58,.9)'; g.lineWidth = 2.2;
    g.strokeRect(hx(0), hx(0), cell * (N - 1), cell * (N - 1));
    g.fillStyle = 'rgba(139,104,58,.9)';
    [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]].forEach(([x, y]) => { g.beginPath(); g.arc(hx(x), hx(y), cell * .09, 0, 7); g.fill(); });
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (S.b[y][x]) stone(x, y, S.b[y][x]);
    if (S.last && !S.winLine) {
      g.beginPath(); g.arc(hx(S.last.x), hx(S.last.y), cell * .12, 0, 7);
      g.fillStyle = S.b[S.last.y][S.last.x] === 1 ? '#ff6482' : '#3478f6';
      g.fill();
    }
    if (S.winLine) {
      const [a, b2] = S.winLine;
      const grad = g.createLinearGradient(hx(a.x), hx(a.y), hx(b2.x), hx(b2.y));
      grad.addColorStop(0, 'rgba(255,200,60,.2)'); grad.addColorStop(.5, 'rgba(255,170,20,.95)'); grad.addColorStop(1, 'rgba(255,200,60,.2)');
      g.strokeStyle = grad; g.lineWidth = cell * .3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(hx(a.x), hx(a.y)); g.lineTo(hx(b2.x), hx(b2.y)); g.stroke();
    }
    if (S.anim) {
      const p = Math.min(1, (t - S.anim.t0) / 220);
      const e = 1 - Math.pow(1 - p, 3);
      stone(S.anim.x, S.anim.y, S.anim.p, 0.3 + 0.7 * (1 + Math.sin(e * Math.PI) * 0.12) * e + (1 - e) * 0, e);
      if (p < 1) requestAnimationFrame(draw); else { S.anim = null; draw(); }
    }
  }

  function lineWin(x, y, p) {
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [dx, dy] of dirs) {
      const cells = [{ x, y }];
      for (const s of [1, -1]) {
        let nx = x + dx * s, ny = y + dy * s;
        while (nx >= 0 && nx < N && ny >= 0 && ny < N && S.b[ny][nx] === p) { cells.push({ x: nx, y: ny }); nx += dx * s; ny += dy * s; }
      }
      if (cells.length >= 5) {
        cells.sort((a, b2) => (a.x - b2.x) || (a.y - b2.y));
        return [cells[0], cells[cells.length - 1]];
      }
    }
    return null;
  }

  function place(x, y, byMe) {
    if (S.over || S.b[y][x]) return false;
    S.b[y][x] = S.turn;
    S.history.push({ x, y });
    S.anim = { x, y, p: S.turn, t0: performance.now() };
    S.last = { x, y };
    ctx.sfx.play('place');
    const w = lineWin(x, y, S.turn);
    if (w) {
      S.over = true; S.winLine = w;
      draw();
      setTimeout(() => {
        if (S.turn === S.my) ctx.finish('win', '五子连珠，技压全场！');
        else ctx.finish('lose', '对方五子连珠。');
      }, 700);
      if (ctx.mode === 'online') ctx.send('mv', { x, y }, serialize());
      return true;
    }
    if (S.history.length >= N * N) {
      S.over = true;
      if (ctx.mode === 'online') ctx.send('mv', { x, y }, serialize());
      setTimeout(() => ctx.finish('draw', '棋盘已满，平分秋色。'), 300);
      return true;
    }
    S.turn = 3 - S.turn;
    draw();
    if (ctx.mode === 'online') ctx.send('mv', { x, y }, serialize());
    afterTurn();
    return true;
  }

  function afterTurn() {
    if (S.over) return;
    if (S.turn === S.my) {
      ctx.turn(0); ctx.setStatus('你的回合');
      if (ctx.mode === 'ai') setTimeout(aiMove, 420 + Math.random() * 400);
    } else {
      ctx.turn(1); ctx.setStatus('等待对方落子…');
    }
  }

  function evalPoint(x, y, p) {
    let score = 0;
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [dx, dy] of dirs) {
      let cnt = 1, open = 0, block = 0;
      for (const s of [1, -1]) {
        let i = 1;
        while (true) {
          const nx = x + dx * s * i, ny = y + dy * s * i;
          if (nx < 0 || nx >= N || ny < 0 || ny >= N) { block++; break; }
          if (S.b[ny][nx] === p) { cnt++; i++; continue; }
          if (S.b[ny][nx] === 0) open++; else block++;
          break;
        }
      }
      if (cnt >= 5) score += 1e7;
      else if (cnt === 4 && block === 0) score += 5e5;
      else if (cnt === 4 && block === 1) score += 8e4;
      else if (cnt === 3 && open === 2) score += 5e4;
      else if (cnt === 3 && open === 1) score += 3200;
      else if (cnt === 2 && open === 2) score += 2600;
      else if (cnt === 2 && open === 1) score += 420;
      else if (cnt === 1 && open === 2) score += 120;
    }
    return score;
  }

  function aiMove() {
    if (S.over || S.turn !== 2) return;
    const me2 = 2, op = 1;
    let best = null, bestScore = -1;
    const cands = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (S.b[y][x] === 0) cands.push({ x, y, d: near(x, y) });
    cands.sort((a, b2) => a.d - b2.d);
    const list = cands.slice(0, Math.min(cands.length, 48));
    if (S.history.length === 0) { place(7, 7); return; }
    for (const c of list) {
      const atk = evalPoint(c.x, c.y, me2);
      const def = evalPoint(c.x, c.y, op);
      const s = atk + def * 0.88 + Math.random() * 60 - c.d * 3;
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best) place(best.x, best.y);
  }
  function near(x, y) {
    let m = 99;
    for (const h of S.history) { const d = Math.max(Math.abs(h.x - x), Math.abs(h.y - y)); if (d < m) m = d; }
    return m;
  }

  function onResize() {
    const w = Math.min(620, ctx.root.clientWidth - 8, window.innerWidth - 48);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    size = w;
    cv.width = w * dpr; cv.height = w * dpr;
    cv.style.width = w + 'px'; cv.style.height = w + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    pad = cell;
    cell = w / (N + 1);
    pad = cell;
    draw();
  }

  return {
    create(c) {
      ctx = c;
      newBoard();
      S.my = c.mode === 'ai' ? 1 : c.side + 1;
      cv = document.createElement('canvas');
      cv.className = 'gk-cv';
      cv.style.boxShadow = '0 10px 34px rgba(120,85,30,.18), 0 2px 6px rgba(0,0,0,.08)';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:13px;color:var(--ink2);font-weight:600';
      hint.textContent = c.mode === 'ai' ? '你执黑先行 · 点击棋盘落子' : (S.my === 1 ? '你执黑先行 · 点击棋盘落子' : '你执白后行');
      c.root.appendChild(hint);
      onResize();
      window.addEventListener('resize', onResize);
      cv.addEventListener('pointerdown', e => {
        const r = cv.getBoundingClientRect();
        const x = Math.round((e.clientX - r.left - pad) / cell);
        const y = Math.round((e.clientY - r.top - pad) / cell);
        if (x < 0 || x >= N || y < 0 || y >= N) return;
        if (S.over || S.turn !== S.my) return;
        place(x, y, true);
      });
      c.onMsg((k, d) => { if (k === 'mv' && d && !S.over) { S.my = S.my; place(d.x, d.y, false); } });
      c.onRestore(s => deserialize(s));
      afterTurn();
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, serialize());
      return { destroy() { window.removeEventListener('resize', onResize); } };
    }
  };
})();
