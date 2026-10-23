'use strict';
window.GameDef = (() => {
  const N = 26, CELL = 21, B = N * CELL, TICK = 150;
  let ctx = null, cv = null, g = null, dpr = 1, scale = 1, rafId = 0, stopped = false, lastSend = 0, lastIn = 0, acc = 0, prevT = 0;
  const S = {
    snakes: [[], []], dir: [[1, 0], [-1, 0]], q: [[], []], food: [[], []],
    alive: [1, 1], s: [0, 0], tick: 0, over: false, done: false, parts: [], pop: [0, 0], flashT: 0
  };
  const isHost = () => ctx.mode !== 'online' || ctx.side === 0;
  const myIdx = () => ctx.mode === 'online' ? ctx.side : 0;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  function mkSnake(hx, hy, dx, dy) {
    const b = [];
    for (let i = 0; i < 4; i++) b.push([hx - dx * i, hy - dy * i]);
    return b;
  }
  function freeCells() {
    const occ = new Uint8Array(N * N);
    for (const sn of S.snakes) for (const [x, y] of sn) occ[y * N + x] = 1;
    for (const [x, y] of S.food) if (x >= 0) occ[y * N + x] = 1;
    const out = [];
    for (let i = 0; i < N * N; i++) if (!occ[i]) out.push(i);
    return out;
  }
  function spawnFood(idx) {
    const free = freeCells();
    if (!free.length) { S.food[idx] = [-1, -1]; return; }
    const c = free[Math.floor(ctx.rng() * free.length)];
    S.food[idx] = [c % N, Math.floor(c / N)];
  }
  function init() {
    S.snakes[0] = mkSnake(5, 23, 1, 0);
    S.snakes[1] = mkSnake(20, 2, -1, 0);
    S.dir = [[1, 0], [-1, 0]];
    S.q = [[], []];
    S.food = [[], []];
    spawnFood(0); spawnFood(1);
    S.alive = [1, 1]; S.s = [0, 0]; S.tick = 0; S.over = false; S.done = false;
    S.parts.length = 0;
  }
  function flat(body) { const o = []; for (const [x, y] of body) o.push(x, y); return o; }
  function unflat(a) { const o = []; for (let i = 0; i < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; }
  function snap() {
    return {
      g: 'snake',
      snakes: [flat(S.snakes[0]), flat(S.snakes[1])],
      dir: [S.dir[0].slice(), S.dir[1].slice()],
      food: [S.food[0].slice(), S.food[1].slice()],
      dead: [S.alive[0] ? 0 : 1, S.alive[1] ? 0 : 1],
      s: S.s.slice(), tick: S.tick, ov: S.over ? 1 : 0
    };
  }
  function deathFx(i) {
    for (const [x, y] of S.snakes[i]) {
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3.2;
        S.parts.push({
          x: x * CELL + CELL / 2, y: y * CELL + CELL / 2,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
          life: 1, r: 2 + Math.random() * 3, col: i === 0 ? '#7cc0ff' : '#ff8ba0'
        });
      }
    }
  }
  function endSnake(w) {
    if (S.done) return;
    S.done = true; S.over = true;
    if (!S.alive[0]) deathFx(0);
    if (!S.alive[1]) deathFx(1);
    const iWin = ctx.mode === 'ai' ? w === 0 : w === ctx.side;
    const name = w < 0 ? '' : (iWin ? '你' : (ctx.mode === 'ai' ? 'AI' : ctx.opp.name));
    if (ctx.mode === 'online' && isHost()) {
      ctx.send('end', { w, s: S.s.slice() });
      ctx.send('st', snap(), snap());
    }
    setTimeout(() => {
      if (stopped) return;
      const txt = w < 0 ? '平局 · 比分 ' + S.s[0] + ' : ' + S.s[1] : name + '获胜 · 比分 ' + S.s[0] + ' : ' + S.s[1];
      ctx.finish(w < 0 ? 'draw' : (iWin ? 'win' : 'lose'), txt);
    }, 950);
  }
  function flood(blocked, sx, sy) {
    const seen = new Uint8Array(N * N);
    const q = [sy * N + sx];
    seen[q[0]] = 1;
    let n = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h]; n++;
      const cx = c % N, cy = (c / N) | 0;
      const nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
      for (const [ax, ay] of nb) {
        if (ax < 0 || ay < 0 || ax >= N || ay >= N) continue;
        const idx = ay * N + ax;
        if (seen[idx] || blocked[idx]) continue;
        seen[idx] = 1; q.push(idx);
      }
    }
    return n;
  }
  function bfsFirst(head, target, blocked) {
    if (head[0] === target[0] && head[1] === target[1]) return null;
    const start = head[1] * N + head[0], goal = target[1] * N + target[0];
    const prev = new Int16Array(N * N).fill(-1);
    prev[start] = -2;
    const q = [start];
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (c === goal) {
        const path = [];
        let cur = c;
        while (cur !== start) { path.push(cur); cur = prev[cur]; }
        const f = path[path.length - 1];
        return [f % N, Math.floor(f / N)];
      }
      const cx = c % N, cy = (c / N) | 0;
      for (const [ax, ay] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (ax < 0 || ay < 0 || ax >= N || ay >= N) continue;
        const idx = ay * N + ax;
        if (prev[idx] !== -1 || blocked[idx]) continue;
        prev[idx] = c; q.push(idx);
      }
    }
    return null;
  }
  function aiDir() {
    const sn = S.snakes[1], head = sn[0];
    const blocked = new Uint8Array(N * N);
    for (const s of S.snakes) for (const [x, y] of s) blocked[y * N + x] = 1;
    blocked[head[1] * N + head[0]] = 0;
    const opp = [-S.dir[1][0], -S.dir[1][1]];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => !(d[0] === opp[0] && d[1] === opp[1]));
    let bestFood = null, bd = 1e9;
    for (const f of S.food) {
      if (f[0] < 0) continue;
      const dd = Math.abs(head[0] - f[0]) + Math.abs(head[1] - f[1]);
      if (dd < bd) { bd = dd; bestFood = f; }
    }
    const cands = [];
    for (const d of dirs) {
      const nx = head[0] + d[0], ny = head[1] + d[1];
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || blocked[ny * N + nx]) continue;
      const b2 = blocked.slice();
      b2[ny * N + nx] = 1;
      const space = flood(b2, nx, ny);
      let dist = 1e9;
      if (bestFood) dist = Math.abs(nx - bestFood[0]) + Math.abs(ny - bestFood[1]);
      cands.push({ d, nx, ny, space, dist });
    }
    if (!cands.length) return S.dir[1];
    if (Math.random() < .05) return cands[Math.floor(Math.random() * cands.length)].d;
    if (bestFood) {
      const step = bfsFirst(head, bestFood, blocked);
      if (step) {
        const c = cands.find(c => c.nx === step[0] && c.ny === step[1] && c.space > sn.length);
        if (c) return c.d;
      }
    }
    cands.sort((a, b) => (b.space > sn.length ? 1 : 0) - (a.space > sn.length ? 1 : 0) || b.space - a.space || a.dist - b.dist);
    return cands[0].d;
  }
  function doTick() {
    S.tick++;
    if (ctx.mode === 'ai') S.dir[1] = aiDir();
    for (let i = 0; i < 2; i++) {
      const q = S.q[i];
      while (q.length) {
        const d = q.shift();
        if (d[0] === -S.dir[i][0] && d[1] === -S.dir[i][1]) continue;
        if (d[0] === S.dir[i][0] && d[1] === S.dir[i][1]) continue;
        S.dir[i] = d;
        break;
      }
    }
    const nh = [
      [S.snakes[0][0][0] + S.dir[0][0], S.snakes[0][0][1] + S.dir[0][1]],
      [S.snakes[1][0][0] + S.dir[1][0], S.snakes[1][0][1] + S.dir[1][1]]
    ];
    const grow = [false, false];
    let ate = -1;
    for (let i = 0; i < 2; i++) {
      for (let f = 0; f < 2; f++) {
        if (S.food[f][0] >= 0 && nh[i][0] === S.food[f][0] && nh[i][1] === S.food[f][1]) { grow[i] = true; ate = f; }
      }
    }
    const headOn = nh[0][0] === nh[1][0] && nh[0][1] === nh[1][1];
    const dead = [false, false];
    const obst = (x, y, self) => {
      for (let j = 0; j < 2; j++) {
        const body = S.snakes[j];
        for (let k = 0; k < body.length; k++) {
          if (j === self && k === 0) continue;
          if (!grow[j] && k === body.length - 1) continue;
          if (body[k][0] === x && body[k][1] === y) return true;
        }
      }
      return false;
    };
    for (let i = 0; i < 2; i++) {
      const [x, y] = nh[i];
      if (x < 0 || y < 0 || x >= N || y >= N || obst(x, y, i)) dead[i] = true;
    }
    if (headOn) {
      const l0 = S.snakes[0].length, l1 = S.snakes[1].length;
      S.alive[0] = 0; S.alive[1] = 0;
      endSnake(l0 === l1 ? -1 : (l0 > l1 ? 0 : 1));
      if (ctx.mode === 'online' && isHost()) ctx.send('st', snap(), snap());
      return;
    }
    if (dead[0] || dead[1]) {
      if (dead[0]) S.alive[0] = 0;
      if (dead[1]) S.alive[1] = 0;
      if (dead[0] && dead[1]) endSnake(S.s[0] === S.s[1] ? -1 : (S.s[0] > S.s[1] ? 0 : 1));
      else endSnake(dead[0] ? 1 : 0);
      if (ctx.mode === 'online' && isHost()) ctx.send('st', snap(), snap());
      return;
    }
    for (let i = 0; i < 2; i++) {
      S.snakes[i].unshift(nh[i]);
      if (grow[i]) {
        S.s[i]++; S.pop[i] = 1;
        ctx.sfx.play(i === myIdx() ? 'good' : 'pop');
      } else S.snakes[i].pop();
    }
    if (ate >= 0) spawnFood(ate);
    if (ctx.mode === 'online' && isHost()) ctx.send('st', snap(), snap());
  }
  function applySnap(st) {
    if (!st || st.g !== 'snake') return;
    const wasOver = S.over;
    S.snakes[0] = unflat(st.snakes[0]);
    S.snakes[1] = unflat(st.snakes[1]);
    S.dir = [st.dir[0].slice(), st.dir[1].slice()];
    S.food = [st.food[0].slice(), st.food[1].slice()];
    S.s = st.s.slice();
    S.alive = [st.dead[0] ? 0 : 1, st.dead[1] ? 0 : 1];
    S.tick = st.tick;
    if (st.ov && !wasOver) endSnake(st.s[0] > st.s[1] ? 0 : (st.s[1] > st.s[0] ? 1 : -1));
  }
  function drawSnake(body, headC, tailC, alpha) {
    if (body.length < 1) return;
    g.save();
    g.globalAlpha = alpha;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let k = body.length - 1; k > 0; k--) {
      const t = k / Math.max(1, body.length - 1);
      const c1 = headC, c2 = tailC;
      const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
      const gg = Math.round(c1[1] + (c2[1] - c1[1]) * t);
      const b2 = Math.round(c1[2] + (c2[2] - c1[2]) * t);
      g.strokeStyle = 'rgb(' + r + ',' + gg + ',' + b2 + ')';
      g.lineWidth = CELL - 4 - t * 3;
      g.beginPath();
      g.moveTo(body[k][0] * CELL + CELL / 2, body[k][1] * CELL + CELL / 2);
      g.lineTo(body[k - 1][0] * CELL + CELL / 2, body[k - 1][1] * CELL + CELL / 2);
      g.stroke();
    }
    const h = body[0];
    const hx = h[0] * CELL + CELL / 2, hy = h[1] * CELL + CELL / 2;
    const hg = g.createRadialGradient(hx - 3, hy - 4, 2, hx, hy, CELL * .62);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(.35, 'rgb(' + headC.join(',') + ')');
    hg.addColorStop(1, 'rgb(' + tailC.join(',') + ')');
    g.fillStyle = hg;
    g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 8;
    g.beginPath(); g.arc(hx, hy, CELL * .58, 0, 7); g.fill();
    g.shadowBlur = 0;
    const d = S.dir[S.snakes.indexOf(body)] || [1, 0];
    const px = -d[1], py = d[0];
    for (const sgn of [-1, 1]) {
      const ex = hx + d[0] * 3.5 + px * sgn * 4, ey = hy + d[1] * 3.5 + py * sgn * 4;
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(ex, ey, 2.8, 0, 7); g.fill();
      g.fillStyle = '#111';
      g.beginPath(); g.arc(ex + d[0] * 1.1, ey + d[1] * 1.1, 1.4, 0, 7); g.fill();
    }
    g.restore();
  }
  function draw() {
    if (!g) return;
    g.clearRect(0, 0, W0, W0);
    const bg = g.createLinearGradient(0, 0, W0, W0);
    bg.addColorStop(0, '#101c2b'); bg.addColorStop(1, '#0b1220');
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, W0, W0, 20); g.fill();
    g.save();
    g.beginPath(); g.roundRect(0, 0, W0, W0, 20); g.clip();
    g.strokeStyle = 'rgba(255,255,255,.045)'; g.lineWidth = 1;
    for (let i = 1; i < N; i++) {
      g.beginPath(); g.moveTo(i * CELL, 0); g.lineTo(i * CELL, W0); g.stroke();
      g.beginPath(); g.moveTo(0, i * CELL); g.lineTo(W0, i * CELL); g.stroke();
    }
    g.font = '900 150px -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,.05)';
    g.fillText(S.s[0] + ' : ' + S.s[1], W0 / 2, W0 / 2 + 50);
    for (let f = 0; f < 2; f++) {
      const [fx, fy] = S.food[f];
      if (fx < 0) continue;
      const cx = fx * CELL + CELL / 2, cy = fy * CELL + CELL / 2;
      const pu = .5 + .5 * Math.sin(performance.now() / 260 + f * 2);
      const gl = g.createRadialGradient(cx, cy, 1, cx, cy, CELL * 1.4);
      gl.addColorStop(0, 'rgba(255,190,80,' + (.35 + pu * .3) + ')');
      gl.addColorStop(1, 'rgba(255,190,80,0)');
      g.fillStyle = gl;
      g.beginPath(); g.arc(cx, cy, CELL * 1.4, 0, 7); g.fill();
      const fg = g.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, CELL * .48);
      fg.addColorStop(0, '#ffe3a0'); fg.addColorStop(1, '#f5a623');
      g.fillStyle = fg;
      g.shadowColor = 'rgba(255,180,60,.8)'; g.shadowBlur = 8 + pu * 8;
      g.beginPath(); g.arc(cx, cy, CELL * .42, 0, 7); g.fill();
      g.shadowBlur = 0;
    }
    drawSnake(S.snakes[1], [255, 140, 168], [122, 36, 60], S.alive[1] ? 1 : .3);
    drawSnake(S.snakes[0], [140, 200, 255], [30, 80, 150], S.alive[0] ? 1 : .3);
    for (const p of S.parts) {
      g.globalAlpha = Math.max(0, p.life);
      g.fillStyle = p.col;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(2, 2, W0 - 4, W0 - 4, 19); g.stroke();
  }
  const W0 = B;
  function resize() {
    const w = Math.min(500, window.innerWidth - 44, 520);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = W0 * dpr; cv.height = W0 * dpr;
    cv.style.width = w + 'px'; cv.style.height = w + 'px';
    scale = w / W0;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function pushDir(i, d) {
    const q = S.q[i];
    if (q.length >= 2) q.shift();
    q.push(d);
  }
  function onKey(e) {
    const map = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0]
    };
    const d = map[e.key];
    if (!d) return;
    if (S.over) return;
    e.preventDefault();
    const i = myIdx();
    if (ctx.mode === 'online' && !isHost()) {
      const now = performance.now();
      if (now - lastIn < 70) return;
      lastIn = now;
      ctx.send('in', { d });
      pushDir(i, d);
    } else pushDir(i, d);
    ctx.sfx.play('click');
  }
  function loop(t) {
    if (stopped) return;
    if (!prevT) prevT = t;
    let dt = t - prevT;
    prevT = t;
    if (dt > 500) dt = 500;
    if (!S.over && isHost()) {
      acc += dt;
      while (acc >= TICK && !S.over) { acc -= TICK; doTick(); }
    }
    S.pop[0] *= .9; S.pop[1] *= .9;
    for (let i = S.parts.length - 1; i >= 0; i--) {
      const p = S.parts[i];
      p.x += p.vx; p.y += p.vy; p.vy += .06; p.vx *= .97; p.life -= .018;
      if (p.life <= 0) S.parts.splice(i, 1);
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }
  return {
    create(c) {
      ctx = c;
      cv = document.createElement('canvas');
      cv.className = 'gk-cv';
      cv.style.cssText = 'display:block;margin:0 auto;border-radius:20px';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      init();
      resize();
      window.addEventListener('resize', resize);
      window.addEventListener('keydown', onKey);
      c.onMsg((k, d) => {
        if (k === 'st' && d) applySnap(d);
        else if (k === 'in' && d && isHost() && !S.over) pushDir(1, d.d);
        else if (k === 'end' && d) {
          S.s = d.s || S.s;
          const w = d.w;
          if (w < 0) { if (!S.done) { S.done = true; S.over = true; deathFx(0); deathFx(1); setTimeout(() => { if (!stopped) ctx.finish('draw', '平局 · 比分 ' + S.s[0] + ' : ' + S.s[1]); }, 900); } }
          else { if (!S.done) { S.done = true; S.over = true; deathFx(1 - w); setTimeout(() => { if (stopped) return; const iWin = w === ctx.side; ctx.finish(iWin ? 'win' : 'lose', (iWin ? '你' : ctx.opp.name) + '获胜 · 比分 ' + S.s[0] + ' : ' + S.s[1]); }, 900); } }
        }
      });
      c.onRestore(s => {
        const st = s && (s.s0 || s.s1);
        if (st) applySnap(st);
        acc = 0;
      });
      c.onPeer(() => {});
      c.turn(-1);
      c.setStatus('WASD / 方向键控制 · 撞墙撞蛇即败');
      c.setOppStatus(isHost() ? '对战中' : '对战中');
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, snap());
      rafId = requestAnimationFrame(loop);
      return {
        destroy() {
          stopped = true;
          cancelAnimationFrame(rafId);
          window.removeEventListener('resize', resize);
          window.removeEventListener('keydown', onKey);
        }
      };
    }
  };
})();
