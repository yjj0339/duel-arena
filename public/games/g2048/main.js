'use strict';
window.GameDef = (() => {
  const PAL = { 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61', 512: '#edc850', 1024: '#edc53f', 2048: '#edc22e' };
  const S = { grid: [], score: 0, max: 0, mi: 0, done: false, dead: false, over: false, tl: 120, oppMax: 0, oppScore: 0, oppDone: false, myTimeup: false, oppTimeup: false };
  const AI = { grid: [], score: 0, mi: 0, dead: false, done: false };
  let ctx = null, boardEl = null, tileLayer = null, statEl = null, oppBar = null, timeEl = null, timer = 0, aiTimer = 0, keyHandler = null, swipe = null, lastEv = 0, css = null;

  function seedStr(suf, i) { return String(ctx.seed) + suf + ':' + i; }

  function spawnHash(b, suf, i) {
    const empt = [];
    for (let k = 0; k < 16; k++) if (!b[k]) empt.push(k);
    if (!empt.length) return -1;
    const h = hashSeed(seedStr(suf, i));
    const pos = empt[h % empt.length];
    b[pos] = ((h >>> 7) % 10) < 9 ? 2 : 4;
    return pos;
  }

  function initGrid(b, rng) {
    for (let k = 0; k < 2; k++) {
      const empt = [];
      for (let i = 0; i < 16; i++) if (!b[i]) empt.push(i);
      const pos = empt[Math.floor(rng() * empt.length)];
      b[pos] = rng() < .9 ? 2 : 4;
    }
  }

  function maxValue(b) { let m = 0; for (const v of b) if (v > m) m = v; return m; }

  function slide(b, dir) {
    const range = [0, 1, 2, 3];
    const lines = [];
    for (const i of range) {
      const idxs = [];
      for (const j of range) {
        if (dir === 'L') idxs.push(i * 4 + j);
        else if (dir === 'R') idxs.push(i * 4 + (3 - j));
        else if (dir === 'U') idxs.push(j * 4 + i);
        else idxs.push((3 - j) * 4 + i);
      }
      lines.push(idxs);
    }
    let moved = false, gain = 0;
    const mergedCells = [];
    for (const idxs of lines) {
      const vals = idxs.map(k => b[k]).filter(v => v);
      const out = [], merged = [];
      for (let i = 0; i < vals.length; i++) {
        if (i + 1 < vals.length && vals[i] === vals[i + 1]) { out.push(vals[i] * 2); merged.push(true); gain += vals[i] * 2; i++; }
        else { out.push(vals[i]); merged.push(false); }
      }
      while (out.length < 4) { out.push(0); merged.push(false); }
      idxs.forEach((k, n) => {
        if (b[k] !== out[n]) moved = true;
        b[k] = out[n];
        if (merged[n]) mergedCells.push(k);
      });
    }
    return { moved, gain, mergedCells };
  }

  function canMove(b) {
    for (let i = 0; i < 16; i++) {
      if (!b[i]) return true;
      const r = Math.floor(i / 4), c = i % 4;
      if (c < 3 && b[i] === b[i + 1]) return true;
      if (r < 3 && b[i] === b[i + 4]) return true;
    }
    return false;
  }

  function snap() {
    return { g: 'g2048', grid: S.grid.slice(), score: S.score, max: S.max, over: S.over ? 1 : 0, mi: S.mi, tl: S.tl };
  }

  function restore(s) {
    const mine = s && s['s' + ctx.side];
    if (!mine || !mine.grid) return;
    S.grid = mine.grid.slice();
    S.score = mine.score || 0;
    S.max = mine.max || maxValue(S.grid);
    S.mi = mine.mi || 0;
    S.tl = mine.tl != null ? mine.tl : S.tl;
    S.over = false; S.done = false; S.dead = !canMove(S.grid);
    render(true);
    updateStatus();
  }

  function floatScore(gain) {
    const f = document.createElement('div');
    f.className = 'g2048-float';
    f.textContent = '+' + gain;
    boardEl.appendChild(f);
    setTimeout(() => f.remove(), 800);
  }

  function doMove(dir) {
    if (S.over || S.done || S.dead) return;
    const b = S.grid.slice();
    const res = slide(b, dir);
    if (!res.moved) return;
    S.grid = b;
    S.score += res.gain;
    spawnHash(S.grid, '', S.mi);
    S.mi++;
    S.max = maxValue(S.grid);
    ctx.sfx.play('pop');
    if (res.gain > 0) floatScore(res.gain);
    if (S.max >= 2048) {
      S.done = true;
      ctx.send('ev', { done: 1, score: S.score });
      ctx.send('mv', null, snap());
      render(true);
      ctx.finish('win', '率先合成 2048！得分 ' + S.score);
      return;
    }
    if (!canMove(S.grid)) S.dead = true;
    render(true, res.mergedCells);
    ctx.send('mv', { m: S.mi }, snap());
    const now = performance.now();
    if (now - lastEv > 500) { lastEv = now; ctx.send('ev', { max: S.max, score: S.score }); }
    updateStatus();
  }

  function timeup() {
    if (S.done || S.over || S.myTimeup) return;
    S.myTimeup = true;
    if (S.oppTimeup) { compare(); return; }
    ctx.send('ev', { timeup: 1, max: S.max, score: S.score });
    ctx.send('mv', null, snap());
    ctx.setStatus('时间到！等待对方结算…');
  }

  function compare() {
    if (S.over || S.done) return;
    S.over = true;
    let result, detail = '最大块 ' + S.max + ' : ' + S.oppMax + ' · 分数 ' + S.score + ' : ' + S.oppScore;
    if (S.max > S.oppMax) result = 'win';
    else if (S.max < S.oppMax) result = 'lose';
    else if (S.score > S.oppScore) result = 'win';
    else if (S.score < S.oppScore) result = 'lose';
    else result = 'draw';
    setTimeout(() => ctx.finish(result, detail), 400);
  }

  function updateStatus() {
    if (S.over) return;
    if (S.done) { ctx.setStatus('已合成 2048！'); return; }
    const t = Math.max(0, Math.ceil(S.tl));
    const mm = Math.floor(t / 60), ss = t % 60;
    ctx.setStatus('⏱ ' + mm + ':' + String(ss).padStart(2, '0') + ' · 得分 ' + S.score + ' · 最大 ' + S.max);
    if (timeEl) {
      timeEl.textContent = mm + ':' + String(ss).padStart(2, '0');
      timeEl.classList.toggle('hot', S.tl <= 10);
    }
    if (S.dead) ctx.setStatus('无路可走 · 得分 ' + S.score);
  }

  function render(rebuild, merged) {
    if (!tileLayer) return;
    tileLayer.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const v = S.grid[i];
      if (!v) continue;
      const d = document.createElement('div');
      const digits = String(v).length;
      d.className = 'g2048-tile';
      d.style.background = PAL[v] || (v >= 4096 ? '#3c3a32' : '#bbada0');
      d.style.color = v <= 4 ? '#776e65' : '#fff';
      d.style.fontSize = (digits <= 2 ? 52 : digits === 3 ? 42 : 32) + '%';
      d.textContent = v;
      d.style.left = '3.5%';
      d.style.top = '3.5%';
      d.style.transform = 'translate(' + (i % 4) * 108.6 + '%,' + Math.floor(i / 4) * 108.6 + '%)';
      if (merged && merged.includes(i)) d.classList.add('pop');
      tileLayer.appendChild(d);
    }
    if (oppBar) {
      oppBar.querySelector('.g2048-me').textContent = '我 ' + S.max;
      oppBar.querySelector('.g2048-op').textContent = '对方 ' + (ctx.mode === 'ai' ? maxValue(AI.grid) : S.oppMax);
      oppBar.querySelector('.g2048-ops').textContent = ctx.mode === 'ai' ? 'AI 得分 ' + AI.score : '对方得分 ' + S.oppScore;
    }
  }

  function aiPlay() {
    if (ctx.mode !== 'ai' || S.over) return;
    if (AI.done) return;
    if (AI.dead) return;
    let best = null, bestScore = -Infinity;
    for (const dir of ['L', 'R', 'U', 'D']) {
      const b = AI.grid.slice();
      const res = slide(b, dir);
      if (!res.moved) continue;
      let m = 0;
      for (const v of b) if (v > m) m = v;
      let empty = 0;
      for (const v of b) if (!v) empty++;
      const corner = (b[0] === m || b[3] === m || b[12] === m || b[15] === m) ? 800 : 0;
      let pairs = 0;
      for (let i = 0; i < 16; i++) {
        if (i % 4 < 3 && b[i] && b[i] === b[i + 1]) pairs++;
        if (i < 12 && b[i] && b[i] === b[i + 4]) pairs++;
      }
      const sc = empty * 100 + corner + pairs * 30 + res.gain * 5 + Math.random() * 40;
      if (sc > bestScore) { bestScore = sc; best = { b, gain: res.gain }; }
    }
    if (!best) { AI.dead = true; return; }
    AI.grid = best.b;
    AI.score += best.gain;
    spawnHash(AI.grid, ':a', AI.mi);
    AI.mi++;
    const m = maxValue(AI.grid);
    if (m >= 2048) {
      AI.done = true;
      if (!S.over) { S.over = true; setTimeout(() => ctx.finish('lose', 'AI 率先合成 2048，得分 ' + AI.score), 400); }
      return;
    }
    if (!canMove(AI.grid)) AI.dead = true;
    render();
  }

  return {
    create(c) {
      ctx = c;
      S.grid = new Array(16).fill(0);
      S.score = 0; S.max = 0; S.mi = 0;
      S.done = false; S.dead = false; S.over = false;
      S.tl = 120; S.oppMax = 0; S.oppScore = 0;
      S.oppDone = false; S.myTimeup = false; S.oppTimeup = false;
      initGrid(S.grid, c.rng);
      S.max = maxValue(S.grid);
      if (c.mode === 'ai') {
        AI.grid = new Array(16).fill(0);
        AI.score = 0; AI.mi = 0; AI.dead = false; AI.done = false;
        initGrid(AI.grid, mulberry32(hashSeed(String(c.seed) + ':ai2048')));
      }
      css = document.createElement('style');
      css.textContent = `
      .g2048-wrap{width:min(430px,88vw);margin:0 auto}
      .g2048-bar{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:800;color:var(--ink2);margin-bottom:10px}
      .g2048-time{font-size:16px;font-weight:900;color:var(--ink);background:#eef1f7;border-radius:10px;padding:4px 12px}
      .g2048-time.hot{color:#fff;background:#ff375f;animation:g2048Hot .8s ease infinite}
      @keyframes g2048Hot{50%{transform:scale(1.12)}}
      .g2048-board{position:relative;width:100%;aspect-ratio:1;background:#bbada0;border-radius:16px;padding:3.5%;box-sizing:border-box;box-shadow:0 8px 26px rgba(150,110,60,.3);touch-action:none}
      .g2048-cell{position:absolute;width:20.5%;height:20.5%;background:rgba(238,228,218,.35);border-radius:10px}
      .g2048-layer{position:absolute;inset:0}
      .g2048-tile{position:absolute;width:20.5%;height:20.5%;border-radius:10px;display:grid;place-items:center;font-weight:900;box-shadow:inset 0 -3px 0 rgba(0,0,0,.12),inset 0 2px 0 rgba(255,255,255,.35),0 3px 8px rgba(0,0,0,.14);animation:g2048In .18s ease;will-change:transform}
      @keyframes g2048In{from{scale:.4;opacity:0}}
      .g2048-tile.pop{animation:g2048Pop .22s ease}
      @keyframes g2048Pop{50%{scale:1.18}}
      .g2048-float{position:absolute;left:50%;top:38%;transform:translateX(-50%);font-size:26px;font-weight:900;color:#776e65;animation:g2048Float .8s ease forwards;pointer-events:none;text-shadow:0 1px 0 #fff}
      @keyframes g2048Float{to{translate:0 -46px;opacity:0}}
      `;
      document.head.appendChild(css);
      const wrap = document.createElement('div');
      wrap.className = 'g2048-wrap';
      const bar = document.createElement('div');
      bar.className = 'g2048-bar';
      oppBar = document.createElement('div');
      oppBar.style.cssText = 'display:flex;gap:10px;align-items:center';
      oppBar.innerHTML = '<span class="g2048-me">我 0</span><span class="g2048-op" style="color:var(--acc)">对方 0</span><span class="g2048-ops" style="color:var(--ink2);font-weight:700"></span>';
      timeEl = document.createElement('div');
      timeEl.className = 'g2048-time';
      timeEl.textContent = '2:00';
      bar.appendChild(oppBar);
      bar.appendChild(timeEl);
      boardEl = document.createElement('div');
      boardEl.className = 'g2048-board';
      for (let i = 0; i < 16; i++) {
        const cell = document.createElement('div');
        cell.className = 'g2048-cell';
        cell.style.left = '3.5%';
        cell.style.top = '3.5%';
        cell.style.transform = 'translate(' + (i % 4) * 108.6 + '%,' + Math.floor(i / 4) * 108.6 + '%)';
        boardEl.appendChild(cell);
      }
      tileLayer = document.createElement('div');
      tileLayer.className = 'g2048-layer';
      boardEl.appendChild(tileLayer);
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:13px;color:var(--ink2);font-weight:600;text-align:center;margin-top:10px';
      hint.textContent = '方向键 / WASD / 滑动合并 · 120 秒内先合成 2048 者胜';
      wrap.appendChild(bar);
      wrap.appendChild(boardEl);
      wrap.appendChild(hint);
      c.root.appendChild(wrap);
      keyHandler = e => {
        const map = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D', a: 'L', d: 'R', w: 'U', s: 'D', A: 'L', D: 'R', W: 'U', S: 'D' };
        if (map[e.key]) { e.preventDefault(); doMove(map[e.key]); }
      };
      window.addEventListener('keydown', keyHandler);
      boardEl.addEventListener('pointerdown', e => { swipe = { x: e.clientX, y: e.clientY }; });
      window.addEventListener('pointerup', e => {
        if (!swipe) return;
        const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
        swipe = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 'R' : 'L');
        else doMove(dy > 0 ? 'D' : 'U');
      });
      c.onMsg((k, d) => {
        if (!d) return;
        if (k === 'ev') {
          if (d.done) {
            S.oppDone = true;
            if (!S.over && !S.done) { S.over = true; setTimeout(() => ctx.finish('lose', '对方率先合成 2048，得分 ' + d.score), 400); }
          } else if (d.timeup) {
            S.oppTimeup = true;
            S.oppMax = d.max || 0;
            S.oppScore = d.score || 0;
            if (S.myTimeup || S.tl <= 0) compare();
          } else if (d.max != null) {
            S.oppMax = d.max;
            S.oppScore = d.score || 0;
            render();
          }
        }
      });
      c.onRestore(s => restore(s));
      c.turn(-1);
      timer = setInterval(() => {
        if (S.over || S.done) return;
        S.tl -= .25;
        if (S.tl <= 10 && S.tl > 0 && Math.abs(S.tl - Math.round(S.tl)) < .01) ctx.sfx.play('tick');
        if (S.tl <= 0) { S.tl = 0; timeup(); }
        updateStatus();
      }, 250);
      render();
      updateStatus();
      if (c.mode === 'ai') aiTimer = setInterval(aiPlay, 400);
      if (c.mode === 'online' && c.side === 0) c.send('hello', null, snap());
      return {
        destroy() {
          clearInterval(timer);
          if (aiTimer) clearInterval(aiTimer);
          window.removeEventListener('keydown', keyHandler);
          if (css.parentNode) css.remove();
        }
      };
    }
  };
})();
