'use strict';
window.GameDef = (() => {
  const COLS = 10, ROWS = 20, CELL = 26, PW = COLS * CELL, PH = ROWS * CELL;
  const CW = 470, CH = PH + 40;
  const SHAPES = [
    { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    { size: 2, cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
    { size: 3, cells: [[0, 1], [1, 1], [2, 1], [1, 0]] },
    { size: 3, cells: [[0, 1], [1, 1], [2, 1], [2, 0]] },
    { size: 3, cells: [[0, 1], [1, 1], [2, 1], [0, 0]] },
    { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    { size: 3, cells: [[0, 1], [1, 1], [1, 0], [2, 0]] }
  ];
  const COLORS = ['', '#4dc3ff', '#ffd60a', '#b06cff', '#4cd97b', '#ff6482', '#ff9f0a', '#5aa7ff'];
  let ctx = null, cv = null, g = null, dpr = 1, scale = 1, rafId = 0, stopped = false, frame = 0;
  function mkBoard(isAI) {
    return {
      grid: new Array(ROWS * COLS).fill(0),
      cur: null, nid: 0, score: 0, lines: 0, over: false,
      grav: 0, pend: [], flash: [], shake: 0, red: 0, isAI: !!isAI, plan: null
    };
  }
  const B = { me: null, ai: null };
  const oppView = { grid: null, score: 0, over: 0, seen: 0 };
  let lastSt = 0, aiAcc = 0;
  const isHost = () => ctx.mode !== 'online' || ctx.side === 0;
  function pieceAt(i) {
    return (Math.abs(Math.floor(hashSeed(String(ctx.seed) + '#' + i))) + i * 7) % 7;
  }
  function rotCells(t, r) {
    const sh = SHAPES[t];
    let cells = sh.cells.map(c => c.slice());
    for (let i = 0; i < (r % 4); i++) {
      cells = cells.map(([x, y]) => [sh.size - 1 - y, x]);
    }
    return cells;
  }
  function absCells(bd, cur) {
    return rotCells(cur.t, cur.r).map(([x, y]) => [cur.x + x, cur.y + y]);
  }
  function collide(bd, t, r, x, y) {
    for (const [cx, cy] of rotCells(t, r)) {
      const gx = x + cx, gy = y + cy;
      if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
      if (gy >= 0 && bd.grid[gy * COLS + gx]) return true;
    }
    return false;
  }
  function spawn(bd) {
    const t = pieceAt(bd.nid);
    const cur = { t, r: 0, x: 3, y: -1 };
    if (collide(bd, t, 0, cur.x, 1) || collide(bd, t, 0, cur.x, 0)) {
      die(bd);
      return;
    }
    bd.cur = cur;
    bd.nid++;
  }
  function dropY(bd, cur) {
    let y = cur.y;
    while (!collide(bd, cur.t, cur.r, cur.x, y + 1)) y++;
    return y;
  }
  function lockPiece(bd) {
    const cells = absCells(bd, bd.cur);
    for (const [x, y] of cells) if (y >= 0) bd.grid[y * COLS + x] = bd.cur.t + 1;
    const full = [];
    for (let r = 0; r < ROWS; r++) {
      let ok = true;
      for (let c = 0; c < COLS; c++) if (!bd.grid[r * COLS + c]) { ok = false; break; }
      if (ok) full.push(r);
    }
    bd.cur = null;
    if (full.length) {
      bd.flash = full.map(r => ({ r, t: 1 }));
      for (const r of full) {
        bd.grid.splice(r * COLS, COLS);
        bd.grid.unshift.apply(bd.grid, new Array(COLS).fill(0));
      }
      bd.lines += full.length;
      const gain = [0, 100, 300, 500, 800][full.length];
      bd.score += gain;
      bd.pop = 1;
      const gar = [0, 0, 1, 2, 4][full.length];
      if (gar > 0) sendGarbage(bd, gar);
      if (!bd.isAI) ctx.sfx.play('good');
    }
    spawn(bd);
  }
  function sendGarbage(bd, n) {
    if (bd.isAI) {
      if (ctx.mode === 'ai') B.me.pend.push({ n, at: performance.now() + 800 });
      return;
    }
    if (ctx.mode === 'online') ctx.send('ev', { garbage: n });
    else if (ctx.mode === 'ai' && B.ai && !B.ai.over) B.ai.pend.push({ n, at: performance.now() + 800 });
  }
  function applyGarbage(bd, n) {
    for (let i = 0; i < n; i++) {
      let topFull = false;
      for (let c = 0; c < COLS; c++) if (bd.grid[c]) { topFull = true; break; }
      if (topFull) { die(bd); return; }
      bd.grid.splice(0, COLS);
      const hole = Math.floor(Math.random() * COLS);
      const row = new Array(COLS).fill(8);
      row[hole] = 0;
      bd.grid.push.apply(bd.grid, row);
    }
    bd.shake = 1; bd.red = 1;
    if (!bd.isAI) ctx.sfx.play('bad');
  }
  function die(bd) {
    if (bd.over) return;
    bd.over = true;
    bd.cur = null;
    if (bd.isAI) {
      if (ctx.mode === 'ai' && !B.me.done) {
        B.me.done = true;
        const my = B.me.score, op = bd.score;
        setTimeout(() => { if (!stopped) ctx.finish('win', '你获胜 · 比分 ' + my + ' : ' + op); }, 400);
      }
      return;
    }
    if (ctx.mode === 'online') {
      ctx.send('ev', { dead: 1 });
      ctx.send('st', snapMe(), snapMe());
    }
    if (!B.me.done) {
      B.me.done = true;
      const my = bd.score, op = ctx.mode === 'ai' ? (B.ai ? B.ai.score : 0) : oppView.score;
      setTimeout(() => { if (!stopped) ctx.finish('lose', '方块堆到顶了 · 比分 ' + my + ' : ' + op); }, 400);
    }
  }
  function snapMe() {
    const bd = B.me;
    return {
      g: 'tetris',
      grid: bd.grid.slice(),
      cur: bd.cur ? [bd.cur.t, bd.cur.r, bd.cur.x, bd.cur.y] : null,
      next: [pieceAt(bd.nid), pieceAt(bd.nid + 1), pieceAt(bd.nid + 2)],
      score: bd.score, over: bd.over ? 1 : 0
    };
  }
  function tryMove(bd, dx) {
    if (!bd.cur || bd.over) return;
    if (!collide(bd, bd.cur.t, bd.cur.r, bd.cur.x + dx, bd.cur.y)) bd.cur.x += dx;
  }
  function tryRot(bd) {
    if (!bd.cur || bd.over) return;
    for (const off of [0, 1, -1]) {
      if (!collide(bd, bd.cur.t, bd.cur.r + 1, bd.cur.x + off, bd.cur.y)) {
        bd.cur.r++;
        bd.cur.x += off;
        ctx.sfx.play('click');
        return;
      }
    }
  }
  function softDrop(bd) {
    if (!bd.cur || bd.over) return;
    if (!collide(bd, bd.cur.t, bd.cur.r, bd.cur.x, bd.cur.y + 1)) { bd.cur.y++; bd.score += 1; }
  }
  function hardDrop(bd) {
    if (!bd.cur || bd.over) return;
    const y = dropY(bd, bd.cur);
    bd.score += (y - bd.cur.y) * 2;
    bd.cur.y = y;
    lockPiece(bd);
  }
  function evalGrid(grid) {
    const hts = [];
    for (let c = 0; c < COLS; c++) {
      let h = 0;
      for (let r = 0; r < ROWS; r++) if (grid[r * COLS + c]) { h = ROWS - r; break; }
      hts.push(h);
    }
    let holes = 0;
    for (let c = 0; c < COLS; c++) {
      let seen = false;
      for (let r = 0; r < ROWS; r++) {
        if (grid[r * COLS + c]) seen = true;
        else if (seen) holes++;
      }
    }
    let bump = 0;
    for (let c = 0; c < COLS - 1; c++) bump += Math.abs(hts[c] - hts[c + 1]);
    const agg = hts.reduce((a, b) => a + b, 0);
    return { holes, bump, agg, maxH: Math.max.apply(null, hts) };
  }
  function aiChoose(bd) {
    const cur = bd.cur;
    if (!cur) return null;
    let best = null;
    for (let r = 0; r < 4; r++) {
      for (let x = -2; x < COLS + 2; x++) {
        if (collide(bd, cur.t, r, x, cur.y)) continue;
        const grid = bd.grid.slice();
        let y = cur.y;
        while (!collide(bd, cur.t, r, x, y + 1)) y++;
        let bad = false;
        for (const [cx, cy] of rotCells(cur.t, r)) {
          const gy = y + cy;
          if (gy < 0) { bad = true; break; }
          grid[gy * COLS + x + cx] = cur.t + 1;
        }
        if (bad) continue;
        let full = 0;
        for (let rr = 0; rr < ROWS; rr++) {
          let ok = true;
          for (let c = 0; c < COLS; c++) if (!grid[rr * COLS + c]) { ok = false; break; }
          if (ok) full++;
        }
        for (let rr = ROWS - 1; rr >= 0; rr--) {
          let ok = true;
          for (let c = 0; c < COLS; c++) if (!grid[rr * COLS + c]) { ok = false; break; }
          if (ok) { grid.splice(rr * COLS, COLS); grid.unshift.apply(grid, new Array(COLS).fill(0)); rr++; }
        }
        const ev = evalGrid(grid);
        const sc = full * 120 - ev.holes * 32 - ev.agg * 2.2 - ev.bump * 8 - ev.maxH * 1.6;
        if (!best || sc > best.sc) best = { sc, r, x, y };
      }
    }
    return best;
  }
  function aiStep() {
    const bd = B.ai;
    if (!bd || bd.over || bd.cur == null) return;
    if (bd.cur === null) return;
    if (!bd.plan) bd.plan = aiChoose(bd);
    const p = bd.plan;
    if (!p) { hardDrop(bd); return; }
    if (bd.cur.r % 4 !== p.r % 4) {
      let done = false;
      for (const off of [0, 1, -1]) {
        if (!collide(bd, bd.cur.t, bd.cur.r + 1, bd.cur.x + off, bd.cur.y)) {
          bd.cur.r++; bd.cur.x += off; done = true; break;
        }
      }
      if (!done) bd.plan = null;
      return;
    }
    if (bd.cur.x < p.x) { tryMove(bd, 1); return; }
    if (bd.cur.x > p.x) { tryMove(bd, -1); return; }
    bd.plan = null;
    hardDrop(bd);
  }
  function onKey(e) {
    const bd = B.me;
    if (bd.over || !bd.cur) return;
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); tryMove(bd, -1); break;
      case 'ArrowRight': e.preventDefault(); tryMove(bd, 1); break;
      case 'ArrowDown': e.preventDefault(); softDrop(bd); break;
      case 'ArrowUp': case 'x': case 'X': if (!e.repeat) { e.preventDefault(); tryRot(bd); } break;
      case ' ': if (!e.repeat) { e.preventDefault(); hardDrop(bd); } break;
    }
  }
  function stepBoard(bd, dt) {
    bd.grav += dt;
    while (bd.grav >= 600) {
      bd.grav -= 600;
      if (bd.cur && !bd.over) {
        if (!collide(bd, bd.cur.t, bd.cur.r, bd.cur.x, bd.cur.y + 1)) bd.cur.y++;
        else lockPiece(bd);
      }
    }
    const now = performance.now();
    for (let i = bd.pend.length - 1; i >= 0; i--) {
      if (now >= bd.pend[i].at) {
        const n = bd.pend[i].n;
        bd.pend.splice(i, 1);
        if (!bd.over) applyGarbage(bd, n);
      }
    }
  }
  function applySnapSelf(st) {
    if (!st || st.g !== 'tetris') return;
    const bd = B.me;
    bd.grid = st.grid.slice();
    bd.score = st.score;
    bd.over = !!st.over;
    bd.nid = st.next ? nextIdFrom(st.next[0]) : bd.nid;
    bd.cur = st.cur ? { t: st.cur[0], r: st.cur[1], x: st.cur[2], y: st.cur[3] } : null;
    bd.flash = []; bd.pend = [];
  }
  function nextIdFrom(t) {
    const bd = B.me;
    for (let i = bd.nid; i < bd.nid + 30; i++) if (pieceAt(i) === t) return i + 1;
    return bd.nid;
  }
  function draw() {
    if (!g) return;
    g.clearRect(0, 0, CW, CH);
    const bg = g.createLinearGradient(0, 0, CW, CH);
    bg.addColorStop(0, '#171c2e'); bg.addColorStop(1, '#0e1220');
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, CW, CH, 20); g.fill();
    g.save();
    g.beginPath(); g.roundRect(0, 0, CW, CH, 20); g.clip();
    const bd = B.me;
    const ox = 16, oy = 20;
    if (bd.shake > .02) g.translate((Math.random() - .5) * bd.shake * 8, (Math.random() - .5) * bd.shake * 8);
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.beginPath(); g.roundRect(ox - 4, oy - 4, PW + 8, PH + 8, 8); g.fill();
    g.fillStyle = '#0b0f1a';
    g.fillRect(ox, oy, PW, PH);
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1;
    for (let i = 1; i < COLS; i++) { g.beginPath(); g.moveTo(ox + i * CELL, oy); g.lineTo(ox + i * CELL, oy + PH); g.stroke(); }
    for (let i = 1; i < ROWS; i++) { g.beginPath(); g.moveTo(ox, oy + i * CELL); g.lineTo(ox + PW, oy + i * CELL); g.stroke(); }
    if (bd.red > .03) {
      g.fillStyle = 'rgba(255,60,60,' + bd.red * .25 + ')';
      g.fillRect(ox, oy, PW, PH);
    }
    const block = (x, y, t, a, size) => {
      const s = size || CELL;
      const px = x, py = y;
      const col = t === 8 ? '#8a93a5' : COLORS[t];
      g.globalAlpha = a;
      const gr = g.createLinearGradient(px, py, px, py + s);
      gr.addColorStop(0, shade(col, 1.35)); gr.addColorStop(.5, col); gr.addColorStop(1, shade(col, .65));
      g.fillStyle = gr;
      g.beginPath(); g.roundRect(px + 1, py + 1, s - 2, s - 2, 4); g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.beginPath(); g.roundRect(px + 3, py + 3, s - 6, Math.max(2, s * .22), 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1;
      g.beginPath(); g.roundRect(px + 1, py + 1, s - 2, s - 2, 4); g.stroke();
      g.globalAlpha = 1;
    };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = bd.grid[r * COLS + c];
      if (t) block(ox + c * CELL, oy + r * CELL, t, 1);
    }
    if (bd.cur && !bd.over) {
      const gy = dropY(bd, bd.cur);
      for (const [cx, cy] of rotCells(bd.cur.t, bd.cur.r)) {
        const px = ox + (bd.cur.x + cx) * CELL, py = oy + (gy + cy) * CELL;
        if (gy + cy < 0) continue;
        g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1.5;
        g.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4);
      }
      for (const [cx, cy] of absCells(bd, bd.cur)) {
        if (cy < 0) continue;
        block(ox + cx * CELL, oy + cy * CELL, bd.cur.t + 1, 1);
      }
    }
    for (const f of bd.flash) {
      g.globalAlpha = f.t;
      g.fillStyle = '#fff';
      g.fillRect(ox, oy + f.r * CELL, PW, CELL);
      g.globalAlpha = 1;
    }
    const rx = ox + PW + 24;
    g.textAlign = 'left';
    g.font = '700 13px -apple-system, "Segoe UI", sans-serif';
    const pop = bd.pop || 0;
    g.fillStyle = '#cfd8e3';
    g.font = '800 ' + (18 + pop * 10) + 'px -apple-system, sans-serif';
    g.fillText(String(bd.score), rx, 34);
    g.fillStyle = '#7a8494';
    g.font = '600 11px -apple-system, sans-serif';
    g.fillText('我的得分', rx, 50);
    g.fillStyle = '#7a8494';
    g.font = '700 13px -apple-system, sans-serif';
    g.fillText('对方', rx, 86);
    g.fillStyle = oppView.over ? '#ff6482' : '#cfd8e3';
    g.font = '800 16px -apple-system, sans-serif';
    g.fillText(String(oppView.score), rx + 40, 86);
    const mc = 8, mw = COLS * mc;
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath(); g.roundRect(rx - 4, 96, mw + 8, ROWS * mc + 8, 6); g.fill();
    g.fillStyle = '#0b0f1a';
    g.fillRect(rx, 100, mw, ROWS * mc);
    if (oppView.grid) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (oppView.grid[r * COLS + c]) {
          g.fillStyle = 'rgba(123,92,255,.85)';
          g.fillRect(rx + c * mc + 1, 100 + r * mc + 1, mc - 2, mc - 2);
        }
      }
    }
    if (!oppView.seen) {
      g.fillStyle = 'rgba(255,255,255,.25)';
      g.font = '600 11px -apple-system, sans-serif';
      g.fillText('等待对方数据…', rx, 100 + ROWS * mc / 2);
    }
    g.fillStyle = '#7a8494';
    g.font = '700 13px -apple-system, sans-serif';
    g.fillText('下一个', rx, 100 + ROWS * mc + 26);
    for (let i = 0; i < 3; i++) {
      const t = pieceAt(bd.nid + i);
      const cells = SHAPES[t].cells;
      const size = SHAPES[t].size;
      const bx = rx + 14, by = 100 + ROWS * mc + 40 + i * 52;
      for (const [cx, cy] of cells) {
        block(bx + cx * 16, by + cy * 16, t + 1, .95 - i * .25, 15);
      }
    }
    if (bd.over) {
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.fillRect(ox, oy, PW, PH);
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(2, 2, CW - 4, CH - 4, 19); g.stroke();
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.round((n >> 16) * f));
    const gg = Math.min(255, Math.round((n >> 8 & 255) * f));
    const b = Math.min(255, Math.round((n & 255) * f));
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }
  function resize() {
    const w = Math.min(470, window.innerWidth - 44, 500);
    const h = w * CH / CW;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = CW * dpr; cv.height = CH * dpr;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    scale = w / CW;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function loop(t) {
    if (stopped) return;
    frame++;
    const now = performance.now();
    if (!loop.prev) loop.prev = now;
    const dt = Math.min(300, now - loop.prev);
    loop.prev = now;
    if (!B.me.over) {
      stepBoard(B.me, dt);
      if (ctx.mode === 'ai' && B.ai && !B.ai.over) {
        aiAcc += dt;
        while (aiAcc >= 350 && !B.ai.over && !B.me.over) {
          aiAcc -= 350;
          stepBoard(B.ai, 350);
          aiStep();
        }
      }
      if (ctx.mode === 'online' && now - lastSt > 1000) {
        lastSt = now;
        ctx.send('st', snapMe(), snapMe());
      }
    }
    for (const f of B.me.flash) f.t -= .06;
    B.me.flash = B.me.flash.filter(f => f.t > 0);
    B.me.shake *= .88;
    B.me.red *= .95;
    B.me.pop = (B.me.pop || 0) * .9;
    draw();
    rafId = requestAnimationFrame(loop);
  }
  return {
    create(c) {
      ctx = c;
      B.me = mkBoard(false);
      if (c.mode === 'ai') B.ai = mkBoard(true);
      cv = document.createElement('canvas');
      cv.className = 'gk-cv';
      cv.style.cssText = 'display:block;margin:0 auto;border-radius:20px';
      c.root.appendChild(cv);
      g = cv.getContext('2d');
      resize();
      window.addEventListener('resize', resize);
      window.addEventListener('keydown', onKey);
      spawn(B.me);
      if (B.ai) spawn(B.ai);
      c.onMsg((k, d) => {
        if (k === 'st' && d && d.g === 'tetris') {
          oppView.grid = d.grid;
          oppView.score = d.score;
          oppView.over = d.over;
          oppView.seen = 1;
        } else if (k === 'ev' && d) {
          if (d.garbage && !B.me.over) B.me.pend.push({ n: d.garbage, at: performance.now() + 800 });
          if (d.dead && !B.me.done) {
            B.me.done = true;
            const my = B.me.score, op = oppView.score;
            ctx.send('st', snapMe(), snapMe());
            setTimeout(() => { if (!stopped) ctx.finish('win', '对手阵亡 · 比分 ' + my + ' : ' + op); }, 300);
          }
        }
      });
      c.onRestore(s => {
        if (!s) return;
        const mine = s['s' + ctx.side];
        if (mine) {
          applySnapSelf(mine);
          if (mine.over && !B.me.done) {
            B.me.done = true;
            setTimeout(() => { if (!stopped) ctx.finish('lose', '方块堆到顶了 · 比分 ' + B.me.score + ' : ' + oppView.score); }, 300);
          }
        }
        const other = s['s' + (1 - ctx.side)];
        if (other && other.g === 'tetris') {
          oppView.grid = other.grid; oppView.score = other.score; oppView.over = other.over; oppView.seen = 1;
          if (other.over && !B.me.done) {
            B.me.done = true;
            setTimeout(() => { if (!stopped) ctx.finish('win', '对手阵亡 · 比分 ' + B.me.score + ' : ' + other.score); }, 300);
          }
        }
      });
      c.onPeer(() => {});
      c.turn(-1);
      c.setStatus('←→移动 ↓软降 ↑/X旋转 空格硬降 · 消行攻击对手');
      c.setOppStatus('对战中');
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, snapMe());
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
