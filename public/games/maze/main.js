'use strict';
window.GameDef = (() => {
  const N = 21, EXIT = 19;
  const S = {};
  let ctx = null, cv = null, g = null, dpr = 1, size = 0, cell = 0, raf = 0, timeInt = 0, lastEv = 0, aiTimer = null, swipe = null, keyHandler = null, upHandler = null, downHandler = null, winTimer = null;

  function genMaze() {
    const rng = mulberry32(hashSeed(String(ctx.seed) + ':maze'));
    const w = Array.from({ length: N }, () => new Array(N).fill(1));
    w[1][1] = 0;
    const st = [[1, 1]];
    while (st.length) {
      const [x, y] = st[st.length - 1];
      const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([a, b]) => {
        const nx = x + a, ny = y + b;
        return nx > 0 && nx < N - 1 && ny > 0 && ny < N - 1 && w[ny][nx] === 1;
      });
      if (!dirs.length) { st.pop(); continue; }
      const [a, b] = dirs[Math.floor(rng() * dirs.length)];
      w[y + b / 2][x + a / 2] = 0;
      w[y + b][x + a] = 0;
      st.push([x + a, y + b]);
    }
    return w;
  }

  function solve() {
    const key = (x, y) => y * N + x;
    const prev = new Map();
    prev.set(key(1, 1), -1);
    const q = [[1, 1]];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      if (x === EXIT && y === EXIT) break;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + a, ny = y + b, k = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= N || ny >= N || S.walls[ny][nx] || prev.has(k)) continue;
        prev.set(k, key(x, y));
        q.push([nx, ny]);
      }
    }
    const path = [];
    let k = key(EXIT, EXIT);
    while (k !== -1 && k != null) { path.push([k % N, (k / N) | 0]); k = prev.get(k); }
    return path.reverse();
  }

  function reset() {
    S.walls = genMaze();
    S.pos = [1, 1]; S.opp = [1, 1];
    S.trail = [[1, 1]]; S.oppTrail = [[1, 1]];
    S.done = false; S.oppDone = false; S.over = false;
    S.t0 = performance.now(); S.elapsed = 0; S.myTime = 0; S.oppTime = 0; S.steps = 0;
    S.path = null; S.aiIdx = 0;
  }

  function snap() {
    return { g: 'maze', pos: S.pos.slice(), trail: S.trail.map(p => p.slice()), done: S.done ? 1 : 0, t: Math.round(S.elapsed) };
  }

  function restore(s) {
    const mine = s && s['s' + ctx.side];
    if (!mine || !mine.pos) return;
    S.pos = mine.pos.slice();
    S.trail = (mine.trail && mine.trail.length) ? mine.trail : [S.pos.slice()];
    S.done = !!mine.done;
    S.elapsed = mine.t || 0;
    S.t0 = performance.now() - S.elapsed;
    if (S.done) S.myTime = S.elapsed;
    S.over = false; S.oppDone = false;
    updateStatus();
    draw();
  }

  function settle() {
    if (S.over || !S.done || !S.oppDone) return;
    S.over = true;
    if (winTimer) { clearTimeout(winTimer); winTimer = null; }
    const win = S.myTime <= S.oppTime;
    setTimeout(() => ctx.finish(win ? 'win' : 'lose', '我 ' + (S.myTime / 1000).toFixed(1) + 's : 对方 ' + (S.oppTime / 1000).toFixed(1) + 's'), 500);
  }

  function onMyFinish() {
    S.done = true;
    S.myTime = S.elapsed;
    ctx.sfx.play('good');
    ctx.send('ev', { done: 1, t: Math.round(S.myTime) });
    ctx.send('mv', null, snap());
    if (S.oppDone) { settle(); return; }
    winTimer = setTimeout(() => { if (!S.over) { S.over = true; ctx.finish('win', '用时 ' + (S.myTime / 1000).toFixed(1) + ' 秒率先冲出迷宫！'); } }, 700);
  }

  function move(dx, dy) {
    if (S.over || S.done || !S.walls) return;
    const nx = S.pos[0] + dx, ny = S.pos[1] + dy;
    if (nx < 0 || ny < 0 || nx >= N || ny >= N || S.walls[ny][nx]) return;
    S.pos = [nx, ny];
    S.steps++;
    if (!S.trail.some(p => p[0] === nx && p[1] === ny)) S.trail.push([nx, ny]);
    ctx.sfx.play('click');
    ctx.send('mv', { x: nx, y: ny }, snap());
    const now = performance.now();
    if (now - lastEv > 100) { lastEv = now; ctx.send('ev', { x: nx, y: ny }); }
    if (nx === EXIT && ny === EXIT) onMyFinish();
    updateStatus();
  }

  function oppMove(x, y) {
    S.opp = [x, y];
    if (!S.oppTrail.some(p => p[0] === x && p[1] === y)) S.oppTrail.push([x, y]);
  }

  function updateStatus() {
    if (S.over) return;
    ctx.setStatus(S.done ? '已完成 ' + (S.myTime / 1000).toFixed(1) + 's' : '⏱ ' + (S.elapsed / 1000).toFixed(1) + 's · 步数 ' + S.steps);
    ctx.setOppStatus(S.oppDone ? '对方已完成' : '竞速中…');
  }

  function startAI() {
    if (ctx.mode !== 'ai') return;
    S.path = solve();
    const step = () => {
      if (ctx.mode !== 'ai' || S.over) return;
      if (S.aiIdx >= S.path.length) return;
      const remain = S.path.length - S.aiIdx;
      let delay = 130 + Math.random() * 60;
      if (remain <= 3 && Math.random() < .1) delay += 400;
      aiTimer = setTimeout(() => {
        const [x, y] = S.path[S.aiIdx++];
        oppMove(x, y);
        if (x === EXIT && y === EXIT) {
          S.oppDone = true;
          S.oppTime = S.elapsed;
          if (!S.done) setTimeout(() => { if (!S.over) ctx.finish('lose', 'AI 用时 ' + (S.oppTime / 1000).toFixed(1) + ' 秒先出迷宫'); }, 500);
          else settle();
        }
        step();
      }, delay);
    };
    step();
  }

  function drawWalls() {
    g.fillStyle = '#3d434d';
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!S.walls[y][x]) continue;
      const px = x * cell, py = y * cell;
      g.beginPath();
      g.roundRect(px + cell * .06, py + cell * .06, cell * .88, cell * .88, cell * .22);
      g.fill();
    }
  }

  function drawTrail(pts, col) {
    g.save();
    g.shadowColor = col; g.shadowBlur = 8;
    g.fillStyle = col;
    g.globalAlpha = .16;
    for (const [x, y] of pts) {
      g.beginPath();
      g.roundRect(x * cell + cell * .18, y * cell + cell * .18, cell * .64, cell * .64, cell * .2);
      g.fill();
    }
    g.restore();
  }

  function drawFlow(t) {
    if (!S.done) return;
    const span = 6;
    const prog = (t / 90) % (S.trail.length + span);
    g.save();
    g.shadowColor = '#ffd66b'; g.shadowBlur = 14;
    for (let i = 0; i < span; i++) {
      const idx = Math.floor(prog) - i;
      if (idx < 0 || idx >= S.trail.length) continue;
      const [x, y] = S.trail[idx];
      g.globalAlpha = .75 * (1 - i / span);
      g.fillStyle = '#ffd66b';
      g.beginPath();
      g.arc((x + .5) * cell, (y + .5) * cell, cell * .18, 0, 7);
      g.fill();
    }
    g.restore();
  }

  function drawFlag(t) {
    const cx = (EXIT + .5) * cell, base = (EXIT + .12) * cell;
    g.save();
    g.strokeStyle = '#8a6d3b';
    g.lineWidth = Math.max(2, cell * .08);
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - cell * .1, base); g.lineTo(cx - cell * .1, base - cell * .78); g.stroke();
    const w = Math.sin(t / 180) * cell * .1;
    const fg = g.createLinearGradient(cx - cell * .1, base - cell * .78, cx + cell * .5, base - cell * .45);
    fg.addColorStop(0, '#ff5f57'); fg.addColorStop(1, '#ff9f0a');
    g.fillStyle = fg;
    g.beginPath();
    g.moveTo(cx - cell * .08, base - cell * .78);
    g.lineTo(cx + cell * .48, base - cell * .6 + w);
    g.lineTo(cx - cell * .08, base - cell * .38);
    g.closePath();
    g.fill();
    g.restore();
  }

  function drawCursor(x, y, col, alpha, t) {
    const cx = (x + .5) * cell, cy = (y + .5) * cell;
    g.save();
    g.globalAlpha = alpha;
    const gr = g.createRadialGradient(cx - cell * .08, cy - cell * .1, cell * .04, cx, cy, cell * .34);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(.35, col);
    gr.addColorStop(1, col);
    g.shadowColor = col; g.shadowBlur = 12;
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, cell * .32 * (1 + Math.sin(t / 260) * .04), 0, 7); g.fill();
    g.globalAlpha = alpha * .9;
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.beginPath(); g.arc(cx - cell * .1, cy - cell * .12, cell * .07, 0, 7); g.fill();
    g.restore();
  }

  function draw(t) {
    if (!g) return;
    g.clearRect(0, 0, size, size);
    const bg = g.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#f4f6fb');
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, size, size, 18); g.fill();
    g.fillStyle = 'rgba(100,163,255,.14)';
    g.beginPath(); g.roundRect(cell + cell * .18, cell + cell * .18, cell * .64, cell * .64, cell * .2); g.fill();
    g.fillStyle = 'rgba(255,159,10,.16)';
    g.beginPath(); g.roundRect(EXIT * cell + cell * .18, EXIT * cell + cell * .18, cell * .64, cell * .64, cell * .2); g.fill();
    if (S.oppTrail && S.oppTrail.length) drawTrail(S.oppTrail, ctx.side === 0 ? '#ff375f' : '#3478f6');
    drawTrail(S.trail, ctx.side === 0 ? '#3478f6' : '#ff375f');
    drawWalls();
    drawFlag(t);
    drawFlow(t);
    drawCursor(S.opp[0], S.opp[1], ctx.side === 0 ? '#ff375f' : '#3478f6', .42, t);
    drawCursor(S.pos[0], S.pos[1], ctx.side === 0 ? '#3478f6' : '#ff375f', 1, t);
    raf = requestAnimationFrame(draw);
  }

  function resize() {
    const w = Math.min(500, ctx.root.clientWidth - 8, window.innerWidth - 48);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    size = w;
    cell = w / N;
    cv.width = w * dpr; cv.height = w * dpr;
    cv.style.width = w + 'px'; cv.style.height = w + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  return {
    create(c) {
      ctx = c;
      reset();
      cv = document.createElement('canvas');
      cv.className = 'gk-cv';
      cv.style.cssText = 'border-radius:18px;box-shadow:0 10px 34px rgba(60,90,160,.16);cursor:pointer;touch-action:none';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:13px;color:var(--ink2);font-weight:600;text-align:center';
      hint.textContent = '方向键 / WASD / 滑动移动 · 走到右下角旗帜即胜';
      c.root.appendChild(hint);
      resize();
      window.addEventListener('resize', resize);
      keyHandler = e => {
        const map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0] };
        const d = map[e.key];
        if (d) { e.preventDefault(); move(d[0], d[1]); }
      };
      window.addEventListener('keydown', keyHandler);
      downHandler = e => { swipe = { x: e.clientX, y: e.clientY }; };
      upHandler = e => {
        if (!swipe) return;
        const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
        swipe = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0);
        else move(0, dy > 0 ? 1 : -1);
      };
      cv.addEventListener('pointerdown', downHandler);
      window.addEventListener('pointerup', upHandler);
      c.onMsg((k, d) => {
        if (!d) return;
        if (k === 'ev') {
          if (d.done) {
            S.oppDone = true;
            S.oppTime = (d.t || 0);
            if (!S.done) {
              S.over = true;
              setTimeout(() => ctx.finish('lose', '对方用时 ' + (S.oppTime / 1000).toFixed(1) + ' 秒率先出迷宫'), 400);
            } else settle();
          } else if (d.x != null) oppMove(d.x, d.y);
        } else if (k === 'mv' && d && d.x != null) oppMove(d.x, d.y);
      });
      c.onRestore(s => restore(s));
      c.turn(-1);
      timeInt = setInterval(() => {
        if (!S.done && !S.over) S.elapsed = performance.now() - S.t0;
        updateStatus();
      }, 100);
      updateStatus();
      draw(0);
      startAI();
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, snap());
      return {
        destroy() {
          cancelAnimationFrame(raf);
          clearInterval(timeInt);
          if (aiTimer) clearTimeout(aiTimer);
          if (winTimer) clearTimeout(winTimer);
          window.removeEventListener('resize', resize);
          window.removeEventListener('keydown', keyHandler);
          window.removeEventListener('pointerup', upHandler);
          if (cv) { cv.removeEventListener('pointerdown', downHandler); }
        }
      };
    }
  };
})();
